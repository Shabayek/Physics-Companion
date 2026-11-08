-- Physics Companion — cloud save (Phase 7)
--
-- One save per player. Writes use optimistic concurrency: put_cloud_save() only succeeds when the
-- caller's expected revision matches the stored one; otherwise it returns the current save so the
-- client can merge (three-way, see src/game/engine/merge.ts) and retry.

create table if not exists public.cloud_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress jsonb not null,
  revision bigint not null check (revision >= 1),
  device text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.cloud_saves enable row level security;
drop policy if exists "own save" on public.cloud_saves;
create policy "own save" on public.cloud_saves for select to authenticated using (user_id = auth.uid());
revoke all on public.cloud_saves from anon, authenticated;
grant select on public.cloud_saves to authenticated;

create or replace function public.get_cloud_save()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('progress', progress, 'revision', revision, 'device', device, 'updated_at', updated_at)
  from cloud_saves where user_id = auth.uid();
$$;

create or replace function public.put_cloud_save(p_progress jsonb, p_expected_revision bigint, p_device text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row cloud_saves%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'code', 'not_authenticated');
  end if;
  if p_progress is null or jsonb_typeof(p_progress) <> 'object' or not (p_progress ? 'version') or not (p_progress ? 'missions') then
    return jsonb_build_object('status', 'error', 'code', 'invalid');
  end if;
  if octet_length(p_progress::text) > /*MAX_SAVE_BYTES*/ 262144 then
    return jsonb_build_object('status', 'error', 'code', 'too_large');
  end if;

  select * into v_row from cloud_saves where user_id = v_uid for update;
  if not found then
    if coalesce(p_expected_revision, 0) <> 0 then
      return jsonb_build_object('status', 'conflict', 'revision', 0, 'progress', null);
    end if;
    insert into cloud_saves (user_id, progress, revision, device) values (v_uid, p_progress, 1, left(coalesce(p_device, ''), 64));
    return jsonb_build_object('status', 'ok', 'revision', 1);
  end if;

  if p_expected_revision is distinct from v_row.revision then
    return jsonb_build_object('status', 'conflict', 'revision', v_row.revision, 'progress', v_row.progress);
  end if;
  if v_row.updated_at > now() - interval '1 second' * /*MIN_SAVE_INTERVAL_S*/ 2 then
    return jsonb_build_object('status', 'retry', 'code', 'too_frequent');
  end if;
  update cloud_saves
     set progress = p_progress, revision = v_row.revision + 1, device = left(coalesce(p_device, ''), 64), updated_at = now()
   where user_id = v_uid;
  return jsonb_build_object('status', 'ok', 'revision', v_row.revision + 1);
exception when unique_violation then
  -- Two first uploads raced: report a conflict so the client merges.
  return jsonb_build_object('status', 'conflict', 'revision', 1, 'progress', (select progress from cloud_saves where user_id = v_uid));
end;
$$;

create or replace function public.delete_cloud_save()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('status', 'error', 'code', 'not_authenticated');
  end if;
  delete from cloud_saves where user_id = v_uid;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- "Delete my online data" now also removes the cloud save.
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
  delete from cloud_saves where user_id = v_uid;
  return jsonb_build_object('status', 'ok', 'scores_deleted', v_scores);
end;
$$;

revoke all on function public.get_cloud_save() from public, anon;
revoke all on function public.put_cloud_save(jsonb, bigint, text) from public, anon;
revoke all on function public.delete_cloud_save() from public, anon;
revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.get_cloud_save() to authenticated;
grant execute on function public.put_cloud_save(jsonb, bigint, text) to authenticated;
grant execute on function public.delete_cloud_save() to authenticated;
grant execute on function public.delete_my_data() to authenticated;
