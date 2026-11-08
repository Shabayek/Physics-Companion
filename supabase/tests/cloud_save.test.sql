-- Cloud save migration tests (each block rolled back).
\set ON_ERROR_STOP 1

begin;
do $$
declare
  r jsonb;
  ok boolean;
  n integer;
begin
  assert public.put_cloud_save('{"version": 2, "missions": {}}', 0, 'd1')->>'code' = 'not_authenticated';
  perform test.login('00000000-0000-0000-0000-000000000001');
  assert public.get_cloud_save() is null, 'no save yet';
  assert public.put_cloud_save('[1, 2]', 0, 'd1')->>'code' = 'invalid';
  assert public.put_cloud_save('{"missions": {}}', 0, 'd1')->>'code' = 'invalid';
  assert public.put_cloud_save(jsonb_build_object('version', 2, 'missions', '{}'::jsonb, 'pad', repeat('x', 300000)), 0, 'd1')->>'code' = 'too_large';

  -- First upload must expect revision 0.
  r := public.put_cloud_save('{"version": 2, "missions": {}, "currency": 10}', 5, 'd1');
  assert r->>'status' = 'conflict' and (r->>'revision')::int = 0, format('expected 0: %s', r);
  r := public.put_cloud_save('{"version": 2, "missions": {}, "currency": 10}', 0, 'd1');
  assert r = '{"status": "ok", "revision": 1}'::jsonb, format('created: %s', r);
  r := public.get_cloud_save();
  assert (r->>'revision')::int = 1 and (r->'progress'->>'currency')::int = 10 and r->>'device' = 'd1', format('read back: %s', r);

  -- A stale writer gets a conflict with the current save to merge.
  r := public.put_cloud_save('{"version": 2, "missions": {}, "currency": 99}', 0, 'd2');
  assert r->>'status' = 'conflict' and (r->>'revision')::int = 1 and (r->'progress'->>'currency')::int = 10, format('conflict: %s', r);

  -- Writes faster than every 2 s are throttled; later ones succeed with the next revision.
  r := public.put_cloud_save('{"version": 2, "missions": {}, "currency": 20}', 1, 'd1');
  assert r = '{"status": "retry", "code": "too_frequent"}'::jsonb, format('throttled: %s', r);
  perform test.logout();
  update public.cloud_saves set updated_at = now() - interval '1 minute';
  perform test.login('00000000-0000-0000-0000-000000000001');
  r := public.put_cloud_save('{"version": 2, "missions": {}, "currency": 20}', 1, 'd1');
  assert r = '{"status": "ok", "revision": 2}'::jsonb, format('updated: %s', r);

  -- Saves are private and cannot be written directly.
  perform test.logout();
  perform test.login('00000000-0000-0000-0000-000000000002');
  assert public.get_cloud_save() is null, 'another player sees nothing';
  select count(*) into n from public.cloud_saves;
  assert n = 0, 'RLS hides other saves';
  begin
    update public.cloud_saves set progress = '{}';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'no direct writes';
  perform test.logout();
  execute 'set local role anon';
  begin
    perform public.get_cloud_save();
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'anon cannot read saves';
end $$;
rollback;
\echo '  ✓ cloud save: create, read, optimistic concurrency, throttle, size limit, privacy'

begin;
do $$
declare
  n integer;
begin
  perform test.login('00000000-0000-0000-0000-000000000001');
  perform public.upsert_profile('Ada', false, true);
  perform public.put_cloud_save('{"version": 2, "missions": {}}', 0, 'd1');
  assert public.delete_cloud_save()->>'status' = 'ok';
  assert public.get_cloud_save() is null;
  perform public.put_cloud_save('{"version": 2, "missions": {}}', 0, 'd1');
  perform public.delete_my_data();
  assert public.get_cloud_save() is null, 'delete_my_data removes the cloud save too';
  assert public.get_my_profile() is null;
end $$;
rollback;
\echo '  ✓ cloud save: delete cloud save / delete my data'
