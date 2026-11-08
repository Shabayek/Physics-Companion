import { describe, it, expect } from 'vitest';
import { canonicalJson, mergeProgress } from '../src/game/engine/merge';
import { defaultProgress, recordMission } from '../src/game/engine/progress';
import { applyEvent, type GameEvent } from '../src/game/engine/events';
import { getMission } from '../src/data/missions';
import { buildMissionQuiz } from '../src/game/engine/questions';
import { salvageProgress } from '../src/game/engine/schema';
import type { Mission, Progress } from '../src/types';
import { rightAnswer } from './helpers/answers';

const T = 1_800_000_000_000;
const base = (): Progress => ({ ...recordMission(defaultProgress('Ada'), 'b-speed', 2, 30, T), currency: 100 });

describe('mergeProgress', () => {
  it('counters add up: Quanta earned on two devices are both kept', () => {
    const b = base();
    const local = { ...b, currency: 130, stats: { ...b.stats, questionsAnswered: 10, quantaEarned: 30 } };
    const remote = { ...b, currency: 150, stats: { ...b.stats, questionsAnswered: 4, quantaEarned: 50 } };
    const m = mergeProgress(b, local, remote);
    expect(m.currency).toBe(180);
    expect(m.stats.questionsAnswered).toBe(14);
    expect(m.stats.quantaEarned).toBe(80);
  });

  it('without a common base (first sync), both sides are counted fully', () => {
    const local = { ...defaultProgress(), currency: 40 };
    const remote = { ...defaultProgress(), currency: 60 };
    expect(mergeProgress(null, local, remote).currency).toBe(100);
  });

  it('missions: best stars/score, attempts add up, completion is kept', () => {
    const b = base();
    const local = recordMission(recordMission(b, 'b-speed', 3, 80, T + 1), 'b-gravity', 0, 5, T + 2);
    const remote = recordMission(b, 'b-speed', 1, 90, T + 3);
    const m = mergeProgress(b, local, remote);
    expect(m.missions['b-speed']).toEqual({ missionId: 'b-speed', completed: true, stars: 3, bestScore: 90, attempts: 3, lastPlayed: T + 3 });
    expect(m.missions['b-gravity']).toMatchObject({ completed: false, attempts: 1 });
  });

  it('sets are unions; worlds stay in order', () => {
    const b = base();
    const local = { ...b, unlockedWorlds: ['beginner', 'intermediate'] as Progress['unlockedWorlds'], collection: { ...b.collection, badges: ['x', 'y'] }, achievements: { a: { unlockedAt: 5 } } };
    const remote = { ...b, unlockedWorlds: ['beginner', 'advanced'] as Progress['unlockedWorlds'], collection: { ...b.collection, badges: ['y', 'z'] }, achievements: { a: { unlockedAt: 3 }, b: { unlockedAt: 9 } } };
    const m = mergeProgress(b, local, remote);
    expect(m.unlockedWorlds).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(m.collection.badges).toEqual(['x', 'y', 'z']);
    expect(m.achievements).toEqual({ a: { unlockedAt: 3 }, b: { unlockedAt: 9 } });
  });

  it('bosses: defeated kept, attempts add, best time min, best hearts max', () => {
    const b = { ...base(), bosses: { g: { defeated: false, attempts: 1, bestTimeMs: null, bestHeartsLeft: 0, defeatedAt: null } } };
    const local = { ...b, bosses: { g: { defeated: true, attempts: 3, bestTimeMs: 50000, bestHeartsLeft: 1, defeatedAt: T + 5 } } };
    const remote = { ...b, bosses: { g: { defeated: true, attempts: 2, bestTimeMs: 40000, bestHeartsLeft: 3, defeatedAt: T + 2 } } };
    expect(mergeProgress(b, local, remote).bosses['g']).toEqual({ defeated: true, attempts: 4, bestTimeMs: 40000, bestHeartsLeft: 3, defeatedAt: T + 2 });
  });

  it('preferences: the side that changed wins (local wins if both changed)', () => {
    const b = base();
    expect(mergeProgress(b, b, { ...b, theme: 'light' }).theme).toBe('light');
    expect(mergeProgress(b, { ...b, theme: 'high-contrast' }, b).theme).toBe('high-contrast');
    expect(mergeProgress(b, { ...b, theme: 'high-contrast' }, { ...b, theme: 'light' }).theme).toBe('high-contrast');
    expect(mergeProgress(b, b, { ...b, settings: { ...b.settings, challengeTiming: 'untimed' } }).settings.challengeTiming).toBe('untimed');
  });

  it('streaks: most recent wins; consecutive streaks across devices are joined', () => {
    const s = (current: number, longest: number, lastActiveDate: string | null) => ({ current, longest, lastActiveDate });
    const b = base();
    const merge = (l: Progress['streak'], r: Progress['streak']) => mergeProgress(b, { ...b, streak: l }, { ...b, streak: r }).streak;
    expect(merge(s(5, 5, '2026-11-06'), s(1, 3, '2026-11-07'))).toEqual(s(6, 6, '2026-11-07')); // played on device B the next day
    expect(merge(s(5, 5, '2026-11-04'), s(1, 3, '2026-11-07'))).toEqual(s(1, 5, '2026-11-07')); // gap: B's new streak
    expect(merge(s(4, 9, '2026-11-07'), s(2, 2, '2026-11-07'))).toEqual(s(4, 9, '2026-11-07')); // same day
    expect(merge(s(0, 0, null), s(3, 3, '2026-11-07'))).toEqual(s(3, 3, '2026-11-07'));
  });

  it('daily history and challenge bests keep the better result', () => {
    const b = base();
    const rec = (score: number) => ({ score, correct: 5, total: 5, completedAt: 1, tier: 'beginner' as const, stars: 3 as const });
    const local = { ...b, daily: { lastCompletedDate: '2026-11-06', history: { '2026-11-06': rec(40) } }, challenge: { runs: 2, best: { 'blitz:standard': { score: 100, at: 1, correct: 5, answered: 5 } } } };
    const remote = { ...b, daily: { lastCompletedDate: '2026-11-07', history: { '2026-11-06': rec(70), '2026-11-07': rec(10) } }, challenge: { runs: 3, best: { 'blitz:standard': { score: 90, at: 2, correct: 5, answered: 5 } } } };
    const m = mergeProgress(b, local, remote);
    expect(m.daily).toEqual({ lastCompletedDate: '2026-11-07', history: { '2026-11-06': rec(70), '2026-11-07': rec(10) } });
    expect(m.challenge).toEqual({ runs: 5, best: { 'blitz:standard': { score: 100, at: 1, correct: 5, answered: 5 } } });
  });

  it('is symmetric for counters and bests, idempotent, and produces a valid save', () => {
    const b = base();
    const local = { ...recordMission(b, 'b-ramp', 3, 50, T), currency: 170, streak: { current: 2, longest: 2, lastActiveDate: '2026-11-07' } };
    const remote = { ...recordMission(b, 'b-magnet', 2, 40, T), currency: 120, unlockedWorlds: ['beginner', 'intermediate'] as Progress['unlockedWorlds'] };
    const ab = mergeProgress(b, local, remote);
    const ba = mergeProgress(b, remote, local);
    expect(ab.currency).toBe(ba.currency);
    expect(ab.missions).toEqual(ba.missions);
    expect(ab.unlockedWorlds).toEqual(ba.unlockedWorlds);
    expect(mergeProgress(ab, ab, ab)).toEqual(ab);
    expect(canonicalJson(salvageProgress(ab))).toBe(canonicalJson(ab));
  });

  it('every stat is either a counter (adds up) or a best (max) — decide explicitly for new stats', () => {
    const counters = ['quizzesTaken', 'questionsAnswered', 'questionsCorrect', 'perfectQuizzes', 'hintsUsed', 'hintFreeQuizzes', 'bossWinsWithoutHints', 'clutchBossWins', 'dailyChallengesCompleted', 'perfectDailies', 'perfectSprints', 'quantaEarned'];
    const bests = ['bestAnswerStreak', 'longestSurvival', 'bestChallengeCombo'];
    expect(Object.keys(defaultProgress().stats).sort()).toEqual([...counters, ...bests].sort());
    const b = defaultProgress();
    const one = Object.fromEntries(Object.keys(b.stats).map((k) => [k, 1])) as unknown as Progress['stats'];
    const merged = mergeProgress(b, { ...b, stats: one }, { ...b, stats: one }).stats as unknown as Record<string, number>;
    for (const k of counters) expect(merged[k], k).toBe(2);
    for (const k of bests) expect(merged[k], k).toBe(1);
  });

  it('end to end: two devices play from the same base; merged Quanta = base + both earnings', () => {
    const mission = getMission('b-speed') as Mission;
    const play = (p: Progress, seed: string): Progress => {
      const event: GameEvent = {
        type: 'MISSION_QUIZ_SUBMITTED', missionId: 'b-speed', seed,
        answers: buildMissionQuiz(mission, seed).map((q) => ({ questionId: q.id, answer: rightAnswer(q), correct: true, hintsUsed: 0, freeHints: 0, timeMs: 3000 })),
      };
      return applyEvent(p, event, { now: T, today: '2026-11-07' }).progress;
    };
    const shared = play(defaultProgress(), '1');
    const deviceA = play(shared, '2');
    const deviceB = play(play(shared, '3'), '4');
    const merged = mergeProgress(shared, deviceA, deviceB);
    expect(merged.currency).toBe(shared.currency + (deviceA.currency - shared.currency) + (deviceB.currency - shared.currency));
    expect(merged.missions['b-speed']?.attempts).toBe(4);
    expect(merged.stats.quizzesTaken).toBe(4);
  });
});

describe('canonicalJson', () => {
  it('ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(canonicalJson({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }));
  });
});
