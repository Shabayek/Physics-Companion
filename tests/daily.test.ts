import { describe, it, expect } from 'vitest';
import { buildDailyChallenge, dailyReward, dailyTier, DAILY_QUESTIONS } from '../src/game/engine/daily';
import { applyEvent, type DailyOutcome, type GameEvent } from '../src/game/engine/events';
import { defaultProgress, unlockNextWorld } from '../src/game/engine/progress';
import { missionsByWorld } from '../src/data/missions';
import { GENERATORS } from '../src/data/questions/generators';
import { parseGeneratedQuestionId } from '../src/game/engine/questions';
import type { AnswerRecord, Difficulty, Progress } from '../src/types';
import { rightAnswer, wrongAnswer } from './helpers/answers';

const NOW = 1_800_000_000_000;
const rec = (correct: boolean, hintsUsed = 0): AnswerRecord => ({ questionId: 'q', answer: '', correct, hintsUsed, freeHints: 0, timeMs: 3000 });

function dailyEvent(date: string, tier: Difficulty, pattern: boolean[] | 'all' | 'none' = 'all'): GameEvent {
  const qs = buildDailyChallenge(date, tier);
  const p = pattern === 'all' ? qs.map(() => true) : pattern === 'none' ? qs.map(() => false) : pattern;
  return {
    type: 'DAILY_CHALLENGE_SUBMITTED',
    date,
    tier,
    answers: qs.map((q, i) => ({ questionId: q.id, answer: p[i] ? rightAnswer(q) : wrongAnswer(q), correct: !!p[i], hintsUsed: 0, freeHints: 0, timeMs: 3000 })),
  };
}
const run = (p: Progress, e: GameEvent, today: string) => applyEvent(p, e, { now: NOW, today });
const daily = (r: ReturnType<typeof run>) => r.outcome as DailyOutcome;

describe('daily challenge set', () => {
  it('tier is the highest unlocked world', () => {
    let p = defaultProgress();
    expect(dailyTier(p)).toBe('beginner');
    p = unlockNextWorld(unlockNextWorld(p, 'beginner'), 'intermediate');
    expect(dailyTier(p)).toBe('advanced');
  });

  it('is the same for everyone on a given date and tier, and changes daily', () => {
    const a = buildDailyChallenge('2026-11-07', 'intermediate');
    expect(a).toHaveLength(DAILY_QUESTIONS);
    expect(buildDailyChallenge('2026-11-07', 'intermediate')).toEqual(a);
    expect(buildDailyChallenge('2026-11-08', 'intermediate').map((q) => q.id)).not.toEqual(a.map((q) => q.id));
    expect(buildDailyChallenge('2026-11-07', 'beginner').map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it('draws only from worlds up to the tier', () => {
    const beginnerTopics = new Set([...missionsByWorld('beginner').map((m) => m.topic), ...GENERATORS.filter((g) => g.world === 'beginner').map((g) => g.topic)]);
    for (let d = 1; d <= 28; d++) {
      const date = `2026-02-${String(d).padStart(2, '0')}`;
      for (const q of buildDailyChallenge(date, 'beginner')) {
        expect(beginnerTopics).toContain(q.topic);
        const gen = parseGeneratedQuestionId(q.id);
        if (gen) expect(GENERATORS.find((g) => g.id === gen.generatorId)?.world).toBe('beginner');
      }
    }
  });
});

describe('dailyReward', () => {
  const five = (n: number, hints = 0) => Array.from({ length: 5 }, (_, i) => rec(i < n, hints));
  it('base scales with accuracy; streak bonus +10%/day capped at +100%; perfect bonus; chest every 7 days', () => {
    expect(dailyReward('beginner', five(5), 1)).toEqual({ base: 20, streakBonus: 2, streakBonusPct: 10, perfectBonus: 10, chest: 0, total: 32 });
    expect(dailyReward('beginner', five(3), 3)).toEqual({ base: 12, streakBonus: 4, streakBonusPct: 30, perfectBonus: 0, chest: 0, total: 16 });
    expect(dailyReward('expert', five(5), 25)).toMatchObject({ base: 50, streakBonus: 50, streakBonusPct: 100, perfectBonus: 25 });
    expect(dailyReward('beginner', five(5), 7).chest).toBe(100);
    expect(dailyReward('beginner', five(5), 14).chest).toBe(100);
    expect(dailyReward('beginner', five(5), 8).chest).toBe(0);
  });
  it('nothing for zero correct, and hints reduce the base', () => {
    expect(dailyReward('beginner', five(0), 7)).toEqual({ base: 0, streakBonus: 0, streakBonusPct: 70, perfectBonus: 0, chest: 0, total: 0 });
    expect(dailyReward('beginner', five(5, 1), 1)).toMatchObject({ base: 15, perfectBonus: 0 });
  });
});

describe('applyEvent: DAILY_CHALLENGE_SUBMITTED', () => {
  it('first completion: rewards, history, stats, streak and achievement', () => {
    const r = run(defaultProgress(), dailyEvent('2026-11-07', 'beginner'), '2026-11-07');
    const o = daily(r);
    expect(o).toMatchObject({ kind: 'daily', practice: false, correct: 5, total: 5 });
    expect(o.reward).toEqual({ base: 20, streakBonus: 2, streakBonusPct: 10, perfectBonus: 10, chest: 0, total: 32 });
    expect(r.progress.daily.lastCompletedDate).toBe('2026-11-07');
    expect(r.progress.daily.history['2026-11-07']).toMatchObject({ correct: 5, total: 5, tier: 'beginner', stars: 3, completedAt: NOW });
    expect(r.progress.stats).toMatchObject({ dailyChallengesCompleted: 1, perfectDailies: 1 });
    expect(r.progress.streak).toEqual({ current: 1, longest: 1, lastActiveDate: '2026-11-07' });
    expect(r.streak).toBe('started');
    expect(r.achievements).toEqual(expect.arrayContaining(['daily-dose', 'sharp-mind']));
    expect(r.notices[0]).toEqual({ kind: 'reward', title: 'Daily challenge complete!', message: '+32 Quanta' });
  });

  it('replaying the same day is practice: no reward, no history change, still activity', () => {
    const first = run(defaultProgress(), dailyEvent('2026-11-07', 'beginner'), '2026-11-07');
    const again = run(first.progress, dailyEvent('2026-11-07', 'beginner', 'none'), '2026-11-07');
    expect(daily(again)).toMatchObject({ practice: true, reward: { total: 0 } });
    expect(again.progress.daily).toEqual(first.progress.daily);
    expect(again.progress.currency).toBe(first.progress.currency);
    expect(again.progress.stats.dailyChallengesCompleted).toBe(1);
  });

  it('consecutive days build the streak and the bonus; day 7 opens the chest', () => {
    let p = defaultProgress();
    const results = [];
    for (let d = 1; d <= 7; d++) {
      const date = `2026-11-0${d}`;
      const r = run(p, dailyEvent(date, 'beginner'), date);
      p = r.progress;
      results.push(daily(r).reward);
    }
    expect(results.map((x) => x.streakBonusPct)).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(results.map((x) => x.chest)).toEqual([0, 0, 0, 0, 0, 0, 100]);
    expect(p.streak).toEqual({ current: 7, longest: 7, lastActiveDate: '2026-11-07' });
    expect(p.achievements['week-warrior']).toBeDefined();
    expect(p.achievements['regular']).toBeDefined();
  });

  it('a missed day resets the streak (with a notice)', () => {
    const d1 = run(defaultProgress(), dailyEvent('2026-11-01', 'beginner'), '2026-11-01');
    const d2 = run(d1.progress, dailyEvent('2026-11-02', 'beginner'), '2026-11-02');
    const d4 = run(d2.progress, dailyEvent('2026-11-04', 'beginner'), '2026-11-04');
    expect(d2.streak).toBe('extended');
    expect(d4.streak).toBe('reset');
    expect(d4.progress.streak).toEqual({ current: 1, longest: 2, lastActiveDate: '2026-11-04' });
    expect(d4.notices.map((n) => n.title)).toContain('New streak started');
  });

  it('yesterday’s challenge is accepted after midnight (credited to its date); older or future ones are not', () => {
    const late = run(defaultProgress(), dailyEvent('2026-11-06', 'beginner'), '2026-11-07');
    expect(daily(late).practice).toBe(false);
    expect(late.progress.daily.history['2026-11-06']).toBeDefined();
    expect(late.progress.streak.lastActiveDate).toBe('2026-11-07');
    expect(run(defaultProgress(), dailyEvent('2026-11-05', 'beginner'), '2026-11-07').outcome.kind).toBe('ignored');
    expect(run(defaultProgress(), dailyEvent('2026-11-08', 'beginner'), '2026-11-07').outcome.kind).toBe('ignored');
  });

  it('rejects locked tiers, mismatched answers and invalid dates; re-grades forged answers', () => {
    expect(run(defaultProgress(), dailyEvent('2026-11-07', 'expert'), '2026-11-07').outcome).toEqual({ kind: 'ignored', reason: 'The expert tier is locked' });
    const e = dailyEvent('2026-11-07', 'beginner', 'none');
    if (e.type !== 'DAILY_CHALLENGE_SUBMITTED') throw new Error('unexpected');
    expect(run(defaultProgress(), { ...e, answers: e.answers.slice(1) }, '2026-11-07').outcome.kind).toBe('ignored');
    expect(run(defaultProgress(), { ...e, date: '2026-13-01' }, '2026-11-07').outcome).toEqual({ kind: 'ignored', reason: 'Invalid date' });
    const forged = run(defaultProgress(), { ...e, answers: e.answers.map((a) => ({ ...a, correct: true })) }, '2026-11-07');
    expect(daily(forged)).toMatchObject({ correct: 0, reward: { total: 0 } });
    expect(forged.progress.streak.current).toBe(0); // zero correct answers is not activity
    expect(forged.streak).toBeNull();
  });

  it('keeps at most 90 days of history', () => {
    let p = defaultProgress();
    const history: Progress['daily']['history'] = {};
    for (let i = 0; i < 95; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      history[d] = { score: 1, correct: 1, total: 5, completedAt: 1, tier: 'beginner', stars: 0 };
    }
    p = { ...p, daily: { lastCompletedDate: '2026-04-05', history } };
    const r = run(p, dailyEvent('2026-11-07', 'beginner'), '2026-11-07');
    const keys = Object.keys(r.progress.daily.history).sort();
    expect(keys).toHaveLength(90);
    expect(keys[keys.length - 1]).toBe('2026-11-07');
  });
});

describe('streak from other activities', () => {
  it('missions and bosses count (with ≥1 correct answer); ctx.today decides the day', async () => {
    const { buildMissionQuiz } = await import('../src/game/engine/questions');
    const { getMission } = await import('../src/data/missions');
    const mission = getMission('b-speed');
    if (!mission) throw new Error('missing');
    const answer = (seed: string, correct: boolean): GameEvent => ({
      type: 'MISSION_QUIZ_SUBMITTED',
      missionId: 'b-speed',
      seed,
      answers: buildMissionQuiz(mission, seed).map((q) => ({ questionId: q.id, answer: correct ? rightAnswer(q) : wrongAnswer(q), correct, hintsUsed: 0, freeHints: 0, timeMs: 1 })),
    });
    const d1 = run(defaultProgress(), answer('1', true), '2026-11-07');
    const d2 = run(d1.progress, answer('2', false), '2026-11-08'); // all wrong → not activity
    expect(d2.progress.streak.current).toBe(1);
    const d2b = run(d2.progress, answer('3', true), '2026-11-08');
    expect(d2b.progress.streak).toEqual({ current: 2, longest: 2, lastActiveDate: '2026-11-08' });
  });
});
