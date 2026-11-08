-- Physics Companion — online leaderboard (Phase 6)
--
-- Security model
--   * Players sign in anonymously (Supabase Auth) and get the `authenticated` role.
--   * Tables are never written directly: RLS has no INSERT/UPDATE/DELETE policies and table
--     privileges are revoked. All writes go through SECURITY DEFINER functions that validate input.
--   * Players can read only their own rows; public boards are served by get_leaderboard().
--   * submit_score() runs plausibility checks (the game logic lives in the client, so a server cannot
--     fully re-grade; the seed and answer log are stored so an Edge Function can re-grade later).
--
-- Constants tagged /*NAME*/ must match src/services/leaderboard/rules.ts (checked by a unit test).

-- ============================================================ tables ======

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  kid_mode boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_display_name_key on public.profiles (lower(display_name));

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null,
  kind text not null check (kind in ('challenge', 'daily', 'boss')),
  board text not null,
  score integer not null check (score >= 0),
  time_ms integer not null check (time_ms >= 0),
  correct integer not null check (correct >= 0),
  answered integer not null check (answered >= 1),
  seed text not null,
  log jsonb not null,
  client_version text not null default '',
  created_at timestamptz not null default now(),
  constraint scores_client_id_key unique (user_id, client_id)
);
create index if not exists scores_board_idx on public.scores (board, created_at);
create index if not exists scores_user_recent_idx on public.scores (user_id, created_at);
-- One daily-challenge entry per player per board (date + tier): the first submission counts.
create unique index if not exists scores_one_daily_key on public.scores (user_id, board) where kind = 'daily';

-- Words for moderation and for Kid-mode nicknames (Adjective Animal NN).
create table if not exists public.blocked_words (word text primary key);
create table if not exists public.kid_name_words (
  kind text not null check (kind in ('adjective', 'animal')),
  word text not null,
  primary key (kind, word)
);

-- ================================================================ RLS ======

alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.blocked_words enable row level security;
alter table public.kid_name_words enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "own scores" on public.scores;
create policy "own scores" on public.scores for select to authenticated using (user_id = auth.uid());

revoke all on public.profiles, public.scores, public.blocked_words, public.kid_name_words from anon, authenticated;
grant select on public.profiles, public.scores to authenticated;

-- ============================================================ helpers ======

-- Validates a display name; returns null when valid, otherwise an error code.
create or replace function public.display_name_error(p_name text, p_kid_mode boolean)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_parts text[];
begin
  if char_length(v_name) < /*NAME_MIN*/ 3 or char_length(v_name) > /*NAME_MAX*/ 24 then
    return 'name_length';
  end if;
  if v_name !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]*$' or v_name ~ '  ' then
    return 'name_chars';
  end if;
  if exists (select 1 from blocked_words b where lower(v_name) like '%' || b.word || '%') then
    return 'name_blocked';
  end if;
  if p_kid_mode then
    v_parts := regexp_split_to_array(v_name, ' ');
    if array_length(v_parts, 1) <> 3
       or v_parts[3] !~ '^[0-9]{1,3}$'
       or not exists (select 1 from kid_name_words where kind = 'adjective' and word = v_parts[1])
       or not exists (select 1 from kid_name_words where kind = 'animal' and word = v_parts[2]) then
      return 'name_not_generated';
    end if;
  end if;
  return null;
end;
$$;

-- ========================================================== profiles ======

create or replace function public.upsert_profile(p_display_name text, p_kid_mode boolean, p_is_public boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_error text;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'code', 'not_authenticated');
  end if;
  v_error := display_name_error(v_name, coalesce(p_kid_mode, false));
  if v_error is not null then
    return jsonb_build_object('status', 'error', 'code', v_error);
  end if;
  if exists (select 1 from profiles where lower(display_name) = lower(v_name) and id <> v_uid) then
    return jsonb_build_object('status', 'error', 'code', 'name_taken');
  end if;
  insert into profiles (id, display_name, kid_mode, is_public)
  values (v_uid, v_name, coalesce(p_kid_mode, false), coalesce(p_is_public, true))
  on conflict (id) do update
    set display_name = excluded.display_name,
        kid_mode = excluded.kid_mode,
        is_public = excluded.is_public,
        updated_at = now();
  return jsonb_build_object('status', 'ok', 'display_name', v_name, 'kid_mode', coalesce(p_kid_mode, false), 'is_public', coalesce(p_is_public, true));
exception when unique_violation then
  return jsonb_build_object('status', 'error', 'code', 'name_taken');
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('display_name', display_name, 'kid_mode', kid_mode, 'is_public', is_public)
  from profiles where id = auth.uid();
$$;

-- ============================================================ scores ======

create or replace function public.submit_score(
  p_client_id text,
  p_kind text,
  p_board text,
  p_score integer,
  p_time_ms integer,
  p_correct integer,
  p_answered integer,
  p_seed text,
  p_log jsonb,
  p_client_version text default ''
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_parts text[];
  v_mode text;
  v_timing text;
  v_date date;
  v_len integer;
  v_log_correct integer;
  v_log_time bigint;
  v_fast integer;
  v_bad integer;
  v_paid_hints integer;
  v_total_ms integer;
  v_penalty_ms integer;
  v_recent integer;
  v_id bigint;
  v_rank bigint;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'rejected', 'code', 'not_authenticated');
  end if;
  if not exists (select 1 from profiles where id = v_uid) then
    return jsonb_build_object('status', 'rejected', 'code', 'no_profile');
  end if;
  if p_client_id is null or char_length(p_client_id) not between 8 and 64 or p_seed is null or char_length(p_seed) > 200 then
    return jsonb_build_object('status', 'rejected', 'code', 'invalid');
  end if;

  -- Idempotent retries: the same client_id is accepted once.
  select id into v_id from scores where user_id = v_uid and client_id = p_client_id;
  if v_id is not null then
    return jsonb_build_object('status', 'duplicate');
  end if;

  -- Rate limit.
  select count(*) into v_recent from scores where user_id = v_uid and created_at > now() - interval '1 minute';
  if v_recent >= /*RATE_LIMIT_PER_MINUTE*/ 10 then
    return jsonb_build_object('status', 'retry', 'code', 'rate_limited');
  end if;

  -- Answer log: [{ "t": ms, "c": correct, "h": paid hints }, ...] consistent with the summary.
  if p_log is null or jsonb_typeof(p_log) <> 'array' then
    return jsonb_build_object('status', 'rejected', 'code', 'invalid_log');
  end if;
  v_len := jsonb_array_length(p_log);
  if v_len <> p_answered or v_len < 1 or v_len > /*MAX_ANSWERS*/ 200 then
    return jsonb_build_object('status', 'rejected', 'code', 'invalid_log');
  end if;
  select count(*) filter (where jsonb_typeof(e->'t') <> 'number' or jsonb_typeof(e->'c') <> 'boolean' or jsonb_typeof(e->'h') <> 'number'
                            or (e->>'t')::numeric < 0 or (e->>'t')::numeric > /*MAX_ANSWER_MS*/ 600000
                            or (e->>'h')::numeric not in (0, 1, 2, 3))
    into v_bad from jsonb_array_elements(p_log) e;
  if v_bad > 0 then
    return jsonb_build_object('status', 'rejected', 'code', 'invalid_log');
  end if;
  select count(*) filter (where (e->>'c')::boolean),
         coalesce(sum((e->>'t')::numeric), 0)::bigint,
         count(*) filter (where (e->>'c')::boolean and (e->>'t')::numeric < /*MIN_CORRECT_ANSWER_MS*/ 400),
         coalesce(sum((e->>'h')::numeric), 0)::integer
    into v_log_correct, v_log_time, v_fast, v_paid_hints
    from jsonb_array_elements(p_log) e;
  if v_log_correct <> p_correct or abs(v_log_time - p_time_ms) > v_len then
    return jsonb_build_object('status', 'rejected', 'code', 'inconsistent');
  end if;
  if v_fast > 0 then
    return jsonb_build_object('status', 'rejected', 'code', 'implausible');
  end if;

  -- Per-kind rules.
  if p_kind = 'challenge' then
    v_parts := regexp_match(p_board, '^challenge:(blitz|sprint|survival):(standard|relaxed|untimed)$');
    if v_parts is null then
      return jsonb_build_object('status', 'rejected', 'code', 'invalid_board');
    end if;
    v_mode := v_parts[1];
    v_timing := v_parts[2];
    if p_score > p_correct * /*MAX_POINTS_PER_ANSWER*/ 70 then
      return jsonb_build_object('status', 'rejected', 'code', 'implausible');
    end if;
    if v_mode = 'blitz' then
      if v_timing = 'untimed' then
        if p_answered > /*BLITZ_UNTIMED_QUESTIONS*/ 20 then
          return jsonb_build_object('status', 'rejected', 'code', 'implausible');
        end if;
      else
        v_total_ms := case v_timing when 'relaxed' then /*BLITZ_MS_RELAXED*/ 90000 else /*BLITZ_MS*/ 60000 end;
        v_penalty_ms := case v_timing when 'relaxed' then /*HINT_PENALTY_MS_RELAXED*/ 7500 else /*HINT_PENALTY_MS*/ 5000 end;
        if v_log_time + v_paid_hints * v_penalty_ms > v_total_ms + /*TIMEOUT_GRACE_MS*/ 250 then
          return jsonb_build_object('status', 'rejected', 'code', 'implausible');
        end if;
      end if;
    elsif v_mode = 'sprint' then
      if p_answered > /*SPRINT_QUESTIONS*/ 10 then
        return jsonb_build_object('status', 'rejected', 'code', 'implausible');
      end if;
    else
      if p_answered - p_correct > /*SURVIVAL_LIVES*/ 3 then
        return jsonb_build_object('status', 'rejected', 'code', 'implausible');
      end if;
    end if;
  elsif p_kind = 'daily' then
    v_parts := regexp_match(p_board, '^daily:([0-9]{4}-[0-9]{2}-[0-9]{2}):(beginner|intermediate|advanced|expert)$');
    if v_parts is null then
      return jsonb_build_object('status', 'rejected', 'code', 'invalid_board');
    end if;
    begin
      v_date := v_parts[1]::date;
    exception when others then
      return jsonb_build_object('status', 'rejected', 'code', 'invalid_board');
    end;
    -- Local dates differ from the server's UTC date by up to ±14 h; a late submission may be a day old.
    if v_date < current_date - 2 or v_date > current_date + 1 then
      return jsonb_build_object('status', 'rejected', 'code', 'stale');
    end if;
    if p_answered <> /*DAILY_QUESTIONS*/ 5 or p_score > /*MAX_DAILY_SCORE*/ 85 then
      return jsonb_build_object('status', 'rejected', 'code', 'implausible');
    end if;
    if exists (select 1 from scores where user_id = v_uid and board = p_board and kind = 'daily') then
      return jsonb_build_object('status', 'rejected', 'code', 'already_submitted');
    end if;
  elsif p_kind = 'boss' then
    if p_board !~ '^boss:boss-(beginner|intermediate|advanced|expert)$' then
      return jsonb_build_object('status', 'rejected', 'code', 'invalid_board');
    end if;
    -- score = hearts left on a victory; 90 HP needs at least 9 hits; every miss costs a heart.
    if p_score not between 1 and /*BOSS_MAX_HEARTS*/ 3
       or p_correct < /*BOSS_MIN_HITS*/ 9
       or p_answered - p_correct <> /*BOSS_MAX_HEARTS*/ 3 - p_score
       or p_answered > /*BOSS_MAX_ANSWERS*/ 36 then
      return jsonb_build_object('status', 'rejected', 'code', 'implausible');
    end if;
  else
    return jsonb_build_object('status', 'rejected', 'code', 'invalid_kind');
  end if;

  insert into scores (user_id, client_id, kind, board, score, time_ms, correct, answered, seed, log, client_version)
  values (v_uid, p_client_id, p_kind, p_board, p_score, p_time_ms, p_correct, p_answered, p_seed, p_log, left(coalesce(p_client_version, ''), 40))
  returning id into v_id;

  select r.rank into v_rank from public.get_my_rank(p_board, 'all') r;
  return jsonb_build_object('status', 'accepted', 'rank', v_rank);
exception when unique_violation then
  return jsonb_build_object('status', 'duplicate');
end;
$$;

-- ======================================================= leaderboard ======

-- Best entry per player on a board. Boss boards rank by fastest time (then hearts); others by score
-- (then time). `p_period`: 'all' or 'week' (since Monday 00:00 UTC).
create or replace function public.best_scores(p_board text, p_period text)
returns table (user_id uuid, score integer, time_ms integer, created_at timestamptz, sort1 bigint, sort2 bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct on (s.user_id)
    s.user_id, s.score, s.time_ms, s.created_at,
    case when s.kind = 'boss' then s.time_ms::bigint else -s.score::bigint end as sort1,
    case when s.kind = 'boss' then -s.score::bigint else s.time_ms::bigint end as sort2
  from scores s
  where s.board = p_board
    and (p_period = 'all' or s.created_at >= date_trunc('week', now()))
  order by s.user_id,
    case when s.kind = 'boss' then s.time_ms::bigint else -s.score::bigint end,
    case when s.kind = 'boss' then -s.score::bigint else s.time_ms::bigint end,
    s.created_at;
$$;

create or replace function public.get_leaderboard(p_board text, p_period text default 'all', p_limit integer default 20)
returns table (rank bigint, display_name text, score integer, time_ms integer, created_at timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rank() over (order by b.sort1, b.sort2) as rank,
         p.display_name, b.score, b.time_ms, b.created_at,
         coalesce(b.user_id = auth.uid(), false) as is_me
  from best_scores(p_board, case when p_period = 'week' then 'week' else 'all' end) b
  join profiles p on p.id = b.user_id
  where p.is_public
  order by b.sort1, b.sort2, b.created_at
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- The caller's position among public players (counted even if the caller is private).
create or replace function public.get_my_rank(p_board text, p_period text default 'all')
returns table (rank bigint, display_name text, score integer, time_ms integer, created_at timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with board as (
    select b.*, p.is_public, p.display_name
    from best_scores(p_board, case when p_period = 'week' then 'week' else 'all' end) b
    join profiles p on p.id = b.user_id
  ), me as (
    select * from board where user_id = auth.uid()
  )
  select (select count(*) from board o where o.is_public and o.user_id <> me.user_id and (o.sort1, o.sort2) < (me.sort1, me.sort2)) + 1,
         me.display_name, me.score, me.time_ms, me.created_at, true
  from me;
$$;

-- ============================================================ privacy ======

create or replace function public.delete_my_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_scores integer;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'code', 'not_authenticated');
  end if;
  delete from scores where user_id = v_uid;
  get diagnostics v_scores = row_count;
  delete from profiles where id = v_uid;
  return jsonb_build_object('status', 'ok', 'scores_deleted', v_scores);
end;
$$;

-- ========================================================== privileges ======

revoke all on function public.display_name_error(text, boolean) from public, anon, authenticated;
revoke all on function public.best_scores(text, text) from public, anon, authenticated;
revoke all on function public.upsert_profile(text, boolean, boolean) from public, anon;
revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.submit_score(text, text, text, integer, integer, integer, integer, text, jsonb, text) from public, anon;
revoke all on function public.get_my_rank(text, text) from public, anon;
revoke all on function public.delete_my_data() from public, anon;
revoke all on function public.get_leaderboard(text, text, integer) from public;

grant execute on function public.upsert_profile(text, boolean, boolean) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.submit_score(text, text, text, integer, integer, integer, integer, text, jsonb, text) to authenticated;
grant execute on function public.get_my_rank(text, text) to authenticated;
grant execute on function public.delete_my_data() to authenticated;
grant execute on function public.get_leaderboard(text, text, integer) to anon, authenticated;

-- ================================================================ data ======

insert into public.blocked_words (word) values
  ('fuck'), ('shit'), ('bitch'), ('cunt'), ('dick'), ('piss'), ('slut'), ('whore'), ('nazi'), ('hitler'),
  ('porn'), ('sex'), ('rape'), ('kill'), ('nigg'), ('fag'), ('retard'), ('admin'), ('moderator')
on conflict do nothing;

insert into public.kid_name_words (kind, word) values
  ('adjective', 'Quantum'), ('adjective', 'Cosmic'), ('adjective', 'Atomic'), ('adjective', 'Stellar'),
  ('adjective', 'Electric'), ('adjective', 'Magnetic'), ('adjective', 'Sonic'), ('adjective', 'Radiant'),
  ('adjective', 'Orbital'), ('adjective', 'Nimble'), ('adjective', 'Curious'), ('adjective', 'Brave'),
  ('adjective', 'Clever'), ('adjective', 'Swift'), ('adjective', 'Bright'), ('adjective', 'Gentle'),
  ('animal', 'Otter'), ('animal', 'Panda'), ('animal', 'Falcon'), ('animal', 'Dolphin'), ('animal', 'Koala'),
  ('animal', 'Fox'), ('animal', 'Owl'), ('animal', 'Lynx'), ('animal', 'Turtle'), ('animal', 'Penguin'),
  ('animal', 'Tiger'), ('animal', 'Whale'), ('animal', 'Badger'), ('animal', 'Hedgehog'), ('animal', 'Robin'),
  ('animal', 'Gecko')
on conflict do nothing;
