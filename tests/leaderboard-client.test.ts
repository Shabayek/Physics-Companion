import { describe, it, expect, vi } from 'vitest';
import { applyEvent, type GameEvent } from '../src/game/engine/events';
import { defaultProgress, recordMission } from '../src/game/engine/progress';
import { missionsByWorld } from '../src/data/missions';
import { getBoss } from '../src/data/bosses';
import { buildDailyChallenge } from '../src/game/engine/daily';
import { buildSubmission } from '../src/services/leaderboard/submissions';
import { checkSubmission, describeRejection, LEADERBOARD_RULES } from '../src/services/leaderboard/rules';
import { LocalLeaderboard, LOCAL_BOARD_LIMIT } from '../src/services/leaderboard/localLeaderboard';
import { SubmissionQueue, backoffMs, QUEUE_KEY } from '../src/services/leaderboard/queue';
import { NetworkError, SupabaseLeaderboard, type SupabaseLike } from '../src/services/leaderboard/supabaseLeaderboard';
import { displayNameError, generateNickname } from '../src/services/leaderboard/nicknames';
import { createRng } from '../src/lib/rng';
import type { LeaderboardService, ScoreSubmission, SubmitResult } from '../src/services/leaderboard/types';
import type { Boss } from '../src/types';
import { simulateChallenge } from './helpers/challenge';
import { simulateBoss } from './helpers/boss';
import { rightAnswer } from './helpers/answers';

const NOW = 1_800_000_000_000;

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

function sub(overrides: Partial<ScoreSubmission> = {}): ScoreSubmission {
  const log = overrides.log ?? [{ t: 2000, c: true, h: 0 }];
  return {
    clientId: 'client-0001',
    kind: 'challenge',
    board: 'challenge:sprint:standard',
    score: 10,
    timeMs: log.reduce((s, e) => s + e.t, 0),
    correct: log.filter((e) => e.c).length,
    answered: log.length,
    seed: 's',
    log,
    finishedAt: NOW,
    ...overrides,
  };
}

describe('buildSubmission + checkSubmission on real runs', () => {
  it('a realistic challenge run is submitted and passes the server rules', () => {
    const { inputs } = simulateChallenge('blitz', 'standard', 'beginner', 'x', () => ({ correct: true, timeMs: 3500 }));
    const event: GameEvent = { type: 'CHALLENGE_FINISHED', mode: 'blitz', timing: 'standard', tier: 'beginner', seed: 'x', answers: inputs, endReason: 'time' };
    const result = applyEvent(defaultProgress(), event, { now: NOW, today: '2026-11-07' });
    const s = buildSubmission(event, result, 'client-1234', NOW);
    expect(s).toMatchObject({ kind: 'challenge', board: 'challenge:blitz:standard', seed: 'x', answered: 17, correct: 17 });
    expect(s && checkSubmission(s)).toBeNull();
  });

  it('daily (first run only) and boss victories are submitted; practice and losses are not', () => {
    const date = '2026-11-07';
    const qs = buildDailyChallenge(date, 'beginner');
    const daily: GameEvent = {
      type: 'DAILY_CHALLENGE_SUBMITTED', date, tier: 'beginner',
      answers: qs.map((q) => ({ questionId: q.id, answer: rightAnswer(q), correct: true, hintsUsed: 0, freeHints: 0, timeMs: 4000 })),
    };
    const first = applyEvent(defaultProgress(), daily, { now: NOW, today: date });
    const s = buildSubmission(daily, first, 'client-d-1', NOW);
    expect(s).toMatchObject({ kind: 'daily', board: 'daily:2026-11-07:beginner', answered: 5 });
    expect(s && checkSubmission(s)).toBeNull();
    const practice = applyEvent(first.progress, daily, { now: NOW, today: date });
    expect(buildSubmission(daily, practice, 'client-d-2', NOW)).toBeNull();

    const golem = getBoss('boss-beginner') as Boss;
    let p = defaultProgress();
    for (const m of missionsByWorld('beginner').slice(0, 6)) p = recordMission(p, m.id, 2, 10, NOW);
    const win = simulateBoss(golem, '1', (i) => ({ correct: i !== 3, timeMs: 4200 }));
    const bossEvent: GameEvent = { type: 'BOSS_BATTLE_FINISHED', bossId: golem.id, seed: '1', answers: win.battle.answers };
    const b = buildSubmission(bossEvent, applyEvent(p, bossEvent, { now: NOW }), 'client-b-1', NOW);
    expect(b).toMatchObject({ kind: 'boss', board: 'boss:boss-beginner', score: 2, answered: 10, correct: 9 });
    expect(b && checkSubmission(b)).toBeNull();
    const loss = simulateBoss(golem, '2', () => ({ correct: false }));
    const lossEvent: GameEvent = { type: 'BOSS_BATTLE_FINISHED', bossId: golem.id, seed: '2', answers: loss.battle.answers };
    expect(buildSubmission(lossEvent, applyEvent(p, lossEvent, { now: NOW }), 'client-b-2', NOW)).toBeNull();
  });

  it('paid hints are logged (free Kid-mode hints are not)', () => {
    const { inputs } = simulateChallenge('sprint', 'standard', 'beginner', 'h', (i) => ({ correct: true, timeMs: 5000, hints: i === 0 ? 2 : 0 }));
    const event: GameEvent = { type: 'CHALLENGE_FINISHED', mode: 'sprint', timing: 'standard', tier: 'beginner', seed: 'h', answers: inputs, endReason: 'quit' };
    const s = buildSubmission(event, applyEvent(defaultProgress(), event, { now: NOW }), 'client-h-1', NOW);
    expect(s?.log[0]?.h).toBe(2);
  });
});

describe('checkSubmission mirrors the server rules', () => {
  it.each([
    ['too-fast correct answer', sub({ log: [{ t: 300, c: true, h: 0 }] }), 'implausible'],
    ['score above 70/answer', sub({ score: 71 }), 'implausible'],
    ['inconsistent correct count', { ...sub(), correct: 0 }, 'inconsistent'],
    ['inconsistent time', { ...sub(), timeMs: 99999 }, 'inconsistent'],
    ['bad hint count', sub({ log: [{ t: 2000, c: true, h: 4 }] }), 'invalid_log'],
    ['unknown board', sub({ board: 'challenge:nope:standard' }), 'invalid_board'],
    ['short client id', sub({ clientId: 'x' }), 'invalid'],
    ['blitz over 60 s', sub({ board: 'challenge:blitz:standard', log: Array.from({ length: 31 }, () => ({ t: 2000, c: true, h: 0 })) }), 'implausible'],
    ['sprint > 10', sub({ log: Array.from({ length: 11 }, () => ({ t: 2000, c: true, h: 0 })) }), 'implausible'],
    ['daily score > max', sub({ kind: 'daily', board: 'daily:2026-11-07:beginner', score: 86, log: Array.from({ length: 5 }, () => ({ t: 2000, c: true, h: 0 })) }), 'implausible'],
    ['boss hearts mismatch', sub({ kind: 'boss', board: 'boss:boss-beginner', score: 3, log: [...Array.from({ length: 9 }, () => ({ t: 2000, c: true, h: 0 })), { t: 2000, c: false, h: 0 }] }), 'implausible'],
  ])('%s', (_name, s, code) => {
    expect(checkSubmission(s)).toBe(code);
  });

  it('limits derive from the engine', () => {
    expect(LEADERBOARD_RULES).toMatchObject({ MAX_POINTS_PER_ANSWER: 70, BLITZ_MS: 60000, MAX_DAILY_SCORE: 85, BOSS_MIN_HITS: 9, BOSS_MAX_ANSWERS: 36 });
    expect(describeRejection('already_submitted')).toMatch(/already submitted/);
  });
});

describe('LocalLeaderboard', () => {
  it('keeps your best runs per board, sorted, capped, de-duplicated', async () => {
    const board = new LocalLeaderboard(memoryStorage(), () => NOW);
    for (let i = 0; i < 25; i++) await board.submit(sub({ clientId: `client-${String(i).padStart(4, '0')}`, score: i * 10, finishedAt: NOW - i }));
    expect(await board.submit(sub({ clientId: 'client-0024', score: 9999 }))).toEqual({ status: 'duplicate' }); // still on the board
    const rows = await board.getBoard('challenge:sprint:standard', 'all', 50);
    expect(rows).toHaveLength(LOCAL_BOARD_LIMIT);
    expect(rows.slice(0, 3).map((r) => [r.rank, r.score, r.displayName])).toEqual([[1, 240, 'You'], [2, 230, 'You'], [3, 220, 'You']]);
  });

  it('boss boards rank by fastest time; weekly filter', async () => {
    const board = new LocalLeaderboard(memoryStorage(), () => NOW);
    await board.submit(sub({ clientId: 'client-slow', board: 'boss:boss-beginner', kind: 'boss', score: 3, timeMs: 50000, finishedAt: NOW }));
    await board.submit(sub({ clientId: 'client-fast', board: 'boss:boss-beginner', kind: 'boss', score: 1, timeMs: 30000, finishedAt: NOW - 30 * 86400000 }));
    expect((await board.getBoard('boss:boss-beginner', 'all')).map((r) => r.timeMs)).toEqual([30000, 50000]);
    expect((await board.getBoard('boss:boss-beginner', 'week')).map((r) => r.timeMs)).toEqual([50000]);
  });
});

function fakeService(results: (SubmitResult | Error)[]): LeaderboardService & { sent: ScoreSubmission[] } {
  const sent: ScoreSubmission[] = [];
  return {
    mode: 'online',
    sent,
    getProfile: async () => null,
    saveProfile: async () => ({ ok: false, code: 'x' }),
    submit: async (s) => {
      sent.push(s);
      const r = results.shift() ?? { status: 'accepted' };
      if (r instanceof Error) throw r;
      return r;
    },
    getBoard: async () => [],
    getMyRank: async () => null,
    deleteMyData: async () => undefined,
  };
}

describe('SubmissionQueue', () => {
  it('sends in order; accepted/duplicate removed, rejected dropped and reported', async () => {
    const storage = memoryStorage();
    const q = new SubmissionQueue(storage, () => NOW);
    q.enqueue(sub({ clientId: 'client-a001' }));
    q.enqueue(sub({ clientId: 'client-a002' }));
    q.enqueue(sub({ clientId: 'client-a003' }));
    q.enqueue(sub({ clientId: 'client-a001' })); // re-enqueue replaces, no duplicate
    const service = fakeService([{ status: 'accepted', rank: 4 }, { status: 'rejected', code: 'implausible' }, { status: 'duplicate' }]);
    const report = await q.flush(service);
    expect(service.sent.map((s) => s.clientId)).toEqual(['client-a002', 'client-a003', 'client-a001']);
    expect(report.accepted.map((a) => a.rank)).toEqual([4, undefined]);
    expect(report.rejected).toEqual([{ submission: expect.objectContaining({ clientId: 'client-a003' }), code: 'implausible' }]);
    expect(report.remaining).toBe(0);
    expect(storage.getItem(QUEUE_KEY)).toBeNull();
  });

  it('a network error stops the flush and keeps everything (with backoff) for later', async () => {
    let now = NOW;
    const storage = memoryStorage();
    const q = new SubmissionQueue(storage, () => now);
    q.enqueue(sub({ clientId: 'client-b001' }));
    q.enqueue(sub({ clientId: 'client-b002' }));
    const offline = fakeService([new NetworkError('offline')]);
    const report = await q.flush(offline);
    expect(report).toMatchObject({ offline: true, remaining: 2 });
    expect(offline.sent).toHaveLength(1);
    expect(q.items()[0]).toMatchObject({ attempts: 1, nextAttemptAt: NOW + backoffMs(1) });
    // Not due yet → nothing is sent (unless forced).
    const later = fakeService([]);
    await q.flush(later);
    expect(later.sent.map((s) => s.clientId)).toEqual(['client-b002']);
    now += backoffMs(1);
    const report2 = await q.flush(later);
    expect(report2.remaining).toBe(0);
    // Persisted across instances.
    q.enqueue(sub({ clientId: 'client-b003' }));
    expect(new SubmissionQueue(storage).items().map((i) => i.submission.clientId)).toEqual(['client-b003']);
  });

  it('rate limiting retries with growing backoff; concurrent flushes share one run', async () => {
    const q = new SubmissionQueue(memoryStorage(), () => NOW);
    q.enqueue(sub({ clientId: 'client-c001' }));
    const service = fakeService([{ status: 'retry', code: 'rate_limited' }]);
    const [a, b] = await Promise.all([q.flush(service), q.flush(service)]);
    expect(a).toBe(b);
    expect(service.sent).toHaveLength(1);
    expect([1, 2, 3, 10].map(backoffMs)).toEqual([5000, 10000, 20000, 300000]);
  });
});

describe('SupabaseLeaderboard', () => {
  function client(opts: { session?: boolean; rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null } } = {}) {
    let session = opts.session ? { user: { id: 'u1' } } : null;
    const c = {
      signIns: 0,
      signOuts: 0,
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        signInAnonymously: async () => {
          c.signIns++;
          session = { user: { id: 'anon-1' } };
          return { data: { session }, error: null };
        },
        signOut: async () => {
          c.signOuts++;
          session = null;
          return { error: null };
        },
      },
      rpc: (fn: string, args: Record<string, unknown> = {}) => Promise.resolve(opts.rpc?.(fn, args) ?? { data: null, error: null }),
    };
    return c;
  }

  it('signs in anonymously once, on the first write', async () => {
    const c = client({ rpc: () => ({ data: { status: 'accepted', rank: 3 }, error: null }) });
    const s = new SupabaseLeaderboard(c as unknown as SupabaseLike);
    expect(await s.getProfile()).toBeNull(); // reading does not create an account
    expect(c.signIns).toBe(0);
    expect(await s.submit(sub())).toEqual({ status: 'accepted', rank: 3 });
    await s.submit(sub({ clientId: 'client-0002' }));
    expect(c.signIns).toBe(1);
  });

  it('maps rows and statuses; RPC errors become NetworkError', async () => {
    const s = new SupabaseLeaderboard(
      client({
        session: true,
        rpc: (fn) =>
          fn === 'get_leaderboard'
            ? { data: [{ rank: '1', display_name: 'Ada', score: 150, time_ms: 30000, created_at: '2026-11-07T10:00:00Z', is_me: true }], error: null }
            : fn === 'submit_score'
              ? { data: { status: 'weird' }, error: null }
              : { data: null, error: { message: 'boom' } },
      }) as unknown as SupabaseLike,
    );
    expect(await s.getBoard('b', 'all')).toEqual([{ rank: 1, displayName: 'Ada', score: 150, timeMs: 30000, createdAt: '2026-11-07T10:00:00Z', isMe: true }]);
    expect(await s.submit(sub())).toEqual({ status: 'rejected' });
    await expect(s.getMyRank('b', 'all')).rejects.toBeInstanceOf(NetworkError);
  });

  it('deleting online data signs out', async () => {
    const c = client({ session: true, rpc: () => ({ data: { status: 'ok' }, error: null }) });
    await new SupabaseLeaderboard(c as unknown as SupabaseLike).deleteMyData();
    expect(c.signOuts).toBe(1);
  });
});

describe('nicknames', () => {
  it('generated nicknames are always valid in Kid mode; free text is not', () => {
    const rng = createRng('n');
    for (let i = 0; i < 200; i++) expect(displayNameError(generateNickname(rng), true)).toBeNull();
    expect(displayNameError('Ada Lovelace', true)).toBe('name_not_generated');
    expect(displayNameError('Ada Lovelace', false)).toBeNull();
    expect(displayNameError('Al', false)).toBe('name_length');
    expect(displayNameError('<b>', false)).toBe('name_chars');
    vi.restoreAllMocks();
  });
});
