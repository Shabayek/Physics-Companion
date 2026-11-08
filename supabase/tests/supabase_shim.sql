-- Emulates the parts of a Supabase project the migrations rely on, for local tests only.
-- Never run this against a real Supabase project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  is_anonymous boolean not null default true,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants broad default privileges on new objects to the API roles; emulate that so the
-- migration's explicit REVOKEs are actually exercised.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Test helpers -------------------------------------------------------------
create schema if not exists test;
grant usage on schema test to anon, authenticated;

-- Act as a signed-in (anonymous) player.
create or replace function test.login(p_uid uuid) returns void language plpgsql as $$
begin
  insert into auth.users (id) values (p_uid) on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function test.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- A plausible answer log: n answers, the first `correct` of them correct, each taking `t` ms.
create or replace function test.log(n integer, correct integer, t integer default 2000, h integer default 0) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('t', t, 'c', i <= correct, 'h', h) order by i), '[]'::jsonb)
  from generate_series(1, n) i
$$;
grant execute on all functions in schema test to anon, authenticated;
