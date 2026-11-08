-- Leaderboard migration tests. Each block runs in a transaction that is rolled back.
-- Players: A = ...01, B = ...02, C = ...03.
\set ON_ERROR_STOP 1

-- ------------------------------------------------------------ privileges --
begin;
do $$
declare
  ok boolean;
begin
  perform test.login('00000000-0000-0000-0000-000000000001');
  -- Direct writes are impossible: only the validated functions may write.
  begin
    insert into public.scores (user_id, client_id, kind, board, score, time_ms, correct, answered, seed, log)
    values ('00000000-0000-0000-0000-000000000001', 'x', 'challenge', 'challenge:blitz:standard', 999999, 1, 1, 1, 's', '[]');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'authenticated must not insert into scores directly';
  begin
    update public.profiles set display_name = 'Hacker';
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'authenticated must not update profiles directly';
  begin
    perform 1 from public.blocked_words;
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'word lists are not readable';
end $$;
rollback;

begin;
do $$
declare
  ok boolean;
  n integer;
begin
  perform test.login('00000000-0000-0000-0000-000000000002');
  perform public.upsert_profile('Bob', false, true);
  perform public.submit_score('client-b-0001', 'challenge', 'challenge:sprint:standard', 100, 20000, 10, 10, 's', test.log(10, 10));
  perform test.logout();
  perform test.login('00000000-0000-0000-0000-000000000001');
  select count(*) into n from public.profiles;
  assert n = 0, 'players cannot read other profiles';
  select count(*) into n from public.scores;
  assert n = 0, 'players cannot read other players'' scores (or their answer logs)';
  perform test.logout();
  -- The anonymous API role can read boards but not write.
  execute 'set local role anon';
  select count(*) into n from public.get_leaderboard('challenge:sprint:standard');
  assert n = 1, 'anon can read public boards';
  begin
    perform public.submit_score('client-x-0001', 'challenge', 'challenge:sprint:standard', 1, 2000, 1, 1, 's', test.log(1, 1));
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  assert ok, 'anon cannot submit scores';
end $$;
rollback;
\echo '  ✓ privileges: no direct writes, no reading others, anon read-only'

-- -------------------------------------------------------------- profiles --
begin;
do $$
declare
  r jsonb;
begin
  assert public.upsert_profile('Ada', false, true)->>'code' = 'not_authenticated';
  perform test.login('00000000-0000-0000-0000-000000000001');
  assert public.upsert_profile('Al', false, true)->>'code' = 'name_length';
  assert public.upsert_profile(repeat('x', 25), false, true)->>'code' = 'name_length';
  assert public.upsert_profile('<script>', false, true)->>'code' = 'name_chars';
  assert public.upsert_profile('two  spaces', false, true)->>'code' = 'name_chars';
  assert public.upsert_profile('xXFuCkXx', false, true)->>'code' = 'name_blocked';
  assert public.upsert_profile('Ada Lovelace', true, true)->>'code' = 'name_not_generated', 'kid mode requires a generated nickname';
  assert public.upsert_profile('Quantum Otter 42', true, true)->>'status' = 'ok';
  r := public.upsert_profile('  Ada Lovelace  ', false, false);
  assert r->>'status' = 'ok' and r->>'display_name' = 'Ada Lovelace', format('trimmed update: %s', r);
  r := public.get_my_profile();
  assert r = '{"display_name": "Ada Lovelace", "kid_mode": false, "is_public": false}'::jsonb, format('get_my_profile: %s', r);
  perform test.logout();
  perform test.login('00000000-0000-0000-0000-000000000002');
  assert public.upsert_profile('ADA LOVELACE', false, true)->>'code' = 'name_taken', 'names are unique, case-insensitively';
  assert public.get_my_profile() is null;
end $$;
rollback;
\echo '  ✓ profiles: validation, kid nicknames, unique names, update'

-- ---------------------------------------------------------- submissions --
begin;
do $$
declare
  r jsonb;
begin
  perform test.login('00000000-0000-0000-0000-000000000001');
  r := public.submit_score('client-a-0001', 'challenge', 'challenge:sprint:standard', 150, 20000, 10, 10, 'seed', test.log(10, 10));
  assert r->>'code' = 'no_profile', format('profile required: %s', r);
  perform public.upsert_profile('Ada', false, true);

  r := public.submit_score('client-a-0001', 'challenge', 'challenge:sprint:standard', 150, 20000, 10, 10, 'seed', test.log(10, 10));
  assert r = '{"status": "accepted", "rank": 1}'::jsonb, format('accepted: %s', r);
  r := public.submit_score('client-a-0001', 'challenge', 'challenge:sprint:standard', 150, 20000, 10, 10, 'seed', test.log(10, 10));
  assert r->>'status' = 'duplicate', format('idempotent retry: %s', r);

  assert public.submit_score('short', 'challenge', 'challenge:sprint:standard', 1, 2000, 1, 1, 's', test.log(1, 1))->>'code' = 'invalid';
  assert public.submit_score('client-a-0002', 'challenge', 'challenge:nope:standard', 1, 2000, 1, 1, 's', test.log(1, 1))->>'code' = 'invalid_board';
  assert public.submit_score('client-a-0003', 'hacking', 'challenge:sprint:standard', 1, 2000, 1, 1, 's', test.log(1, 1))->>'code' = 'invalid_kind';
  -- Log must match the summary.
  assert public.submit_score('client-a-0004', 'challenge', 'challenge:sprint:standard', 10, 2000, 1, 2, 's', test.log(1, 1))->>'code' = 'invalid_log';
  assert public.submit_score('client-a-0005', 'challenge', 'challenge:sprint:standard', 10, 4000, 2, 2, 's', test.log(2, 1))->>'code' = 'inconsistent';
  assert public.submit_score('client-a-0006', 'challenge', 'challenge:sprint:standard', 10, 9999, 2, 2, 's', test.log(2, 2))->>'code' = 'inconsistent';
  assert public.submit_score('client-a-0007', 'challenge', 'challenge:sprint:standard', 10, 2000, 1, 1, 's', '[{"t": 2000, "c": true, "h": 7}]')->>'code' = 'invalid_log';
  assert public.submit_score('client-a-0008', 'challenge', 'challenge:sprint:standard', 10, 2000, 1, 1, 's', '{"not": "an array"}')->>'code' = 'invalid_log';
  -- Implausible results.
  assert public.submit_score('client-a-0009', 'challenge', 'challenge:sprint:standard', 71, 2000, 1, 1, 's', test.log(1, 1))->>'code' = 'implausible', 'more than 70 points per correct answer';
  assert public.submit_score('client-a-0010', 'challenge', 'challenge:sprint:standard', 10, 300, 1, 1, 's', test.log(1, 1, 300))->>'code' = 'implausible', 'correct answers faster than 400 ms';
  assert public.submit_score('client-a-0011', 'challenge', 'challenge:sprint:standard', 10, 22000, 11, 11, 's', test.log(11, 11))->>'code' = 'implausible', 'sprint has 10 questions';
  assert public.submit_score('client-a-0012', 'challenge', 'challenge:survival:standard', 10, 10000, 1, 5, 's', test.log(5, 1))->>'code' = 'implausible', 'survival allows 3 misses';
  assert public.submit_score('client-a-0013', 'challenge', 'challenge:blitz:standard', 100, 62000, 31, 31, 's', test.log(31, 31))->>'code' = 'implausible', 'blitz longer than 60 s';
  assert public.submit_score('client-a-0014', 'challenge', 'challenge:blitz:standard', 100, 58000, 29, 29, 's', test.log(29, 29, 2000, 1))->>'code' = 'implausible', 'hint penalties count against the blitz clock';
  r := public.submit_score('client-a-0015', 'challenge', 'challenge:blitz:relaxed', 100, 62000, 31, 31, 's', test.log(31, 31));
  assert r->>'status' = 'accepted', format('relaxed blitz has 90 s: %s', r);
  assert public.submit_score('client-a-0016', 'challenge', 'challenge:blitz:untimed', 100, 420000, 21, 21, 's', test.log(21, 21, 20000))->>'code' = 'implausible', 'untimed blitz has 20 questions';
end $$;
rollback;
\echo '  ✓ submissions: validation, idempotency, plausibility rules'

begin;
do $$
declare
  r jsonb;
  today text := to_char(current_date, 'YYYY-MM-DD');
begin
  perform test.login('00000000-0000-0000-0000-000000000001');
  perform public.upsert_profile('Ada', false, true);
  -- Daily: 5 questions, first submission per date+tier counts, dates near today only.
  r := public.submit_score('client-d-0001', 'daily', 'daily:' || today || ':beginner', 60, 15000, 5, 5, 'daily:' || today, test.log(5, 5, 3000));
  assert r->>'status' = 'accepted', format('daily accepted: %s', r);
  assert public.submit_score('client-d-0002', 'daily', 'daily:' || today || ':beginner', 85, 15000, 5, 5, 's', test.log(5, 5, 3000))->>'code' = 'already_submitted';
  assert public.submit_score('client-d-0003', 'daily', 'daily:' || today || ':intermediate', 85, 15000, 5, 5, 's', test.log(5, 5, 3000))->>'status' = 'accepted', 'another tier is another board';
  assert public.submit_score('client-d-0004', 'daily', 'daily:2020-01-01:beginner', 50, 15000, 5, 5, 's', test.log(5, 5, 3000))->>'code' = 'stale';
  assert public.submit_score('client-d-0005', 'daily', 'daily:2026-02-30:beginner', 50, 15000, 5, 5, 's', test.log(5, 5, 3000))->>'code' = 'invalid_board';
  assert public.submit_score('client-d-0006', 'daily', 'daily:' || to_char(current_date - 1, 'YYYY-MM-DD') || ':advanced', 86, 15000, 5, 5, 's', test.log(5, 5, 3000))->>'code' = 'implausible', 'max daily score is 85';
  assert public.submit_score('client-d-0007', 'daily', 'daily:' || to_char(current_date - 1, 'YYYY-MM-DD') || ':advanced', 40, 12000, 4, 4, 's', test.log(4, 4, 3000))->>'code' = 'implausible', 'daily has 5 questions';
  -- Boss: score = hearts left; misses = 3 - hearts; at least 9 hits.
  assert public.submit_score('client-b-0001', 'boss', 'boss:boss-beginner', 2, 50000, 10, 11, 's', test.log(11, 10, 3636))->>'code' = 'inconsistent', 'time must match the log';
  r := public.submit_score('client-b-0002', 'boss', 'boss:boss-beginner', 2, 33000, 9, 10, 's', test.log(10, 9, 3300));
  assert r->>'status' = 'accepted', format('boss accepted: %s', r);
  assert public.submit_score('client-b-0003', 'boss', 'boss:boss-beginner', 3, 33000, 9, 10, 's', test.log(10, 9, 3300))->>'code' = 'implausible', 'one miss means two hearts';
  assert public.submit_score('client-b-0004', 'boss', 'boss:boss-beginner', 3, 16000, 8, 8, 's', test.log(8, 8))->>'code' = 'implausible', 'needs 9 hits';
  assert public.submit_score('client-b-0005', 'boss', 'boss:boss-nope', 3, 18000, 9, 9, 's', test.log(9, 9))->>'code' = 'invalid_board';
end $$;
rollback;
\echo '  ✓ submissions: daily (one per date and tier) and boss rules'

begin;
do $$
declare
  r jsonb;
begin
  perform test.login('00000000-0000-0000-0000-000000000001');
  perform public.upsert_profile('Ada', false, true);
  for i in 1..10 loop
    r := public.submit_score('client-rate-' || lpad(i::text, 4, '0'), 'challenge', 'challenge:sprint:standard', 10, 2000, 1, 1, 's', test.log(1, 1));
    assert r->>'status' = 'accepted', format('submission %s: %s', i, r);
  end loop;
  r := public.submit_score('client-rate-0011', 'challenge', 'challenge:sprint:standard', 10, 2000, 1, 1, 's', test.log(1, 1));
  assert r = '{"status": "retry", "code": "rate_limited"}'::jsonb, format('rate limited: %s', r);
end $$;
rollback;
\echo '  ✓ submissions: rate limit (10 per minute)'

-- ------------------------------------------------------------ rankings --
begin;
do $$
declare
  r record;
  names text[];
  v jsonb;
begin
  -- A: 150 then 90; B: 120; C (private): 200; D: 120 but slower than B.
  perform test.login('00000000-0000-0000-0000-000000000001');
  perform public.upsert_profile('Ada', false, true);
  perform public.submit_score('client-a-0001', 'challenge', 'challenge:blitz:standard', 150, 30000, 10, 10, 's1', test.log(10, 10, 3000));
  perform public.submit_score('client-a-0002', 'challenge', 'challenge:blitz:standard', 90, 30000, 6, 6, 's2', test.log(6, 6, 5000));
  perform test.logout();
  perform test.login('00000000-0000-0000-0000-000000000002');
  perform public.upsert_profile('Bob', false, true);
  perform public.submit_score('client-b-0001', 'challenge', 'challenge:blitz:standard', 120, 20000, 8, 8, 's', test.log(8, 8, 2500));
  perform test.logout();
  perform test.login('00000000-0000-0000-0000-000000000003');
  perform public.upsert_profile('Cyd', false, false);
  perform public.submit_score('client-c-0001', 'challenge', 'challenge:blitz:standard', 200, 30000, 10, 10, 's', test.log(10, 10, 3000));
  perform test.logout();
  perform test.login('00000000-0000-0000-0000-000000000004');
  perform public.upsert_profile('Dee', false, true);
  perform public.submit_score('client-d-0001', 'challenge', 'challenge:blitz:standard', 120, 24000, 8, 8, 's', test.log(8, 8, 3000));

  select array_agg(display_name || ':' || score || ':' || rank order by rank, display_name) into names
  from public.get_leaderboard('challenge:blitz:standard');
  assert names = array['Ada:150:1', 'Bob:120:2', 'Dee:120:3'], format('best per player, private hidden, faster wins ties: %s', names);
  select * into r from public.get_leaderboard('challenge:blitz:standard') where is_me;
  assert r.display_name = 'Dee', 'is_me marks the caller';
  select * into r from public.get_my_rank('challenge:blitz:standard');
  assert r.rank = 3 and r.score = 120, format('my rank: %s', r);
  perform test.logout();

  -- A private player still learns where they would rank.
  perform test.login('00000000-0000-0000-0000-000000000003');
  select * into r from public.get_my_rank('challenge:blitz:standard');
  assert r.rank = 1, format('private player rank: %s', r);
  perform test.logout();

  -- Weekly boards ignore older scores.
  update public.scores set created_at = now() - interval '30 days' where client_id = 'client-a-0001';
  select array_agg(display_name || ':' || score order by rank, display_name) into names
  from public.get_leaderboard('challenge:blitz:standard', 'week');
  assert names = array['Bob:120', 'Dee:120', 'Ada:90'], format('weekly board: %s', names);
  select array_agg(display_name || ':' || score order by rank) into names
  from public.get_leaderboard('challenge:blitz:standard', 'all', 2);
  assert names = array['Ada:150', 'Bob:120'], format('limit: %s', names);
end $$;
rollback;
\echo '  ✓ rankings: best per player, ties, private players, weekly, limit'

begin;
do $$
declare
  names text[];
begin
  -- Boss boards: fastest clear wins; hearts break ties.
  perform test.login('00000000-0000-0000-0000-000000000001');
  perform public.upsert_profile('Ada', false, true);
  perform public.submit_score('client-a-0001', 'boss', 'boss:boss-beginner', 3, 45000, 9, 9, 's1', test.log(9, 9, 5000));
  perform public.submit_score('client-a-0002', 'boss', 'boss:boss-beginner', 1, 27000, 9, 11, 's2', test.log(11, 9, 2454));
  perform test.logout();
  perform test.login('00000000-0000-0000-0000-000000000002');
  perform public.upsert_profile('Bob', false, true);
  perform public.submit_score('client-b-0001', 'boss', 'boss:boss-beginner', 3, 36000, 9, 9, 's', test.log(9, 9, 4000));
  select array_agg(display_name || ':' || time_ms || ':' || score order by rank) into names from public.get_leaderboard('boss:boss-beginner');
  assert names = array['Ada:27000:1', 'Bob:36000:3'], format('boss board: %s', names);
end $$;
rollback;
\echo '  ✓ rankings: boss boards rank by fastest clear'

-- -------------------------------------------------------------- privacy --
begin;
do $$
declare
  r jsonb;
  n integer;
begin
  perform test.login('00000000-0000-0000-0000-000000000001');
  perform public.upsert_profile('Ada', false, true);
  perform public.submit_score('client-a-0001', 'challenge', 'challenge:sprint:standard', 100, 20000, 10, 10, 's', test.log(10, 10));
  r := public.delete_my_data();
  assert r = '{"status": "ok", "scores_deleted": 1}'::jsonb, format('delete: %s', r);
  assert public.get_my_profile() is null;
  select count(*) into n from public.get_leaderboard('challenge:sprint:standard');
  assert n = 0, 'deleted players disappear from boards';
  perform test.logout();
  assert public.delete_my_data()->>'code' = 'not_authenticated';
end $$;
rollback;
\echo '  ✓ privacy: delete my data'
