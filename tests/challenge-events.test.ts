import { describe, it, expect } from 'vitest';
import { applyEvent, type ChallengeOutcome, type GameEvent } from '../src/game/engine/events';
import { defaultProgress } from '../src/game/engine/progress';
import type { ChallengeMode, ChallengeTiming } from '../src/game/engine/challenge';
import type { Progress } from '../src/types';
import { simulateChallenge, type PlannedChallengeAnswer } from './helpers/challenge';

const NOW = 1_800_000_000_000;
const run = (p: Progress, e: GameEvent) => applyEvent(p, e, { now: NOW, today: '2026-11-07' });
const out = (r: ReturnType<typeof run>) => r.outcome as ChallengeOutcome;

function challengeEvent(mode: ChallengeMode, timing: ChallengeTiming, seed: string, plan: (i: number) => PlannedChallengeAnswer | null, endReason: 'time' | 'quit' = 'quit'): GameEvent {
  const { inputs } = simulateChallenge(mode, timing, 'beginner', seed, (i) => plan(i));
  return { type: 'CHALLENGE_FINISHED', mode, timing, tier: 'beginner', seed, answers: inputs, endReason };
}

describe('applyEvent: CHALLENGE_FINISHED', () => {
  it('records the run, personal best, Quanta, stats, streak and achievements', () => {
    const r = run(defaultProgress(), challengeEvent('sprint', 'standard', 's1', () => ({ correct: true, timeMs: 0 })));
    expect(out(r)).toMatchObject({ kind: 'challenge', mode: 'sprint', score: 220, correct: 10, answered: 10, bestCombo: 10, endReason: 'complete', newBest: true, previousBest: null, quanta: 22 });
    expect(r.progress.challenge).toEqual({ runs: 1, best: { 'sprint:standard': { score: 220, at: NOW, correct: 10, answered: 10 } } });
    expect(r.progress.stats).toMatchObject({ perfectSprints: 1, bestChallengeCombo: 10, questionsAnswered: 10, questionsCorrect: 10 });
    expect(r.progress.streak.current).toBe(1);
    expect(r.achievements).toEqual(expect.arrayContaining(['challenger', 'perfect-sprint', 'combo-master']));
  });

  it('personal bests are per mode and timing; improvements raise a notice', () => {
    const first = run(defaultProgress(), challengeEvent('sprint', 'standard', 's1', () => ({ correct: true, timeMs: 10000 })));
    const worse = run(first.progress, challengeEvent('sprint', 'standard', 's2', (i) => ({ correct: i < 3 })));
    expect(out(worse)).toMatchObject({ newBest: false, previousBest: out(first).score });
    expect(worse.progress.challenge.best['sprint:standard']?.score).toBe(out(first).score);
    const better = run(worse.progress, challengeEvent('sprint', 'standard', 's3', () => ({ correct: true, timeMs: 0 })));
    expect(out(better).newBest).toBe(true);
    expect(better.notices[0]).toEqual({ kind: 'reward', title: 'New personal best in Sprint!', message: `220 points (was ${out(first).score})` });
    const relaxed = run(better.progress, challengeEvent('sprint', 'relaxed', 's4', (i) => ({ correct: i < 2 })));
    expect(out(relaxed)).toMatchObject({ newBest: true, previousBest: null });
    expect(Object.keys(relaxed.progress.challenge.best).sort()).toEqual(['sprint:relaxed', 'sprint:standard']);
  });

  it('Survival tracks the longest run; Blitz keeps the clock reason', () => {
    const s = run(defaultProgress(), challengeEvent('survival', 'standard', 'v', (i) => ({ correct: i < 12 })));
    expect(out(s)).toMatchObject({ endReason: 'lives', correct: 12 });
    expect(s.progress.stats.longestSurvival).toBe(12);
    const b = run(defaultProgress(), challengeEvent('blitz', 'standard', 'b', (i) => (i < 5 ? { correct: true } : null), 'time'));
    expect(out(b).endReason).toBe('time');
  });

  it('a run without correct answers pays nothing and is not streak activity', () => {
    const r = run(defaultProgress(), challengeEvent('sprint', 'standard', 's1', () => ({ correct: false })));
    expect(out(r)).toMatchObject({ score: 0, quanta: 0, newBest: false });
    expect(r.progress.streak.current).toBe(0);
    expect(r.progress.challenge.runs).toBe(1);
  });

  it('rejects locked tiers and forged logs', () => {
    const e = challengeEvent('sprint', 'standard', 's1', () => ({ correct: true }));
    if (e.type !== 'CHALLENGE_FINISHED') throw new Error('unexpected');
    expect(run(defaultProgress(), { ...e, tier: 'advanced' }).outcome).toEqual({ kind: 'ignored', reason: 'The advanced tier is locked' });
    expect(run(defaultProgress(), { ...e, seed: 'other' }).outcome.kind).toBe('ignored');
    const forged = run(defaultProgress(), { ...e, answers: e.answers.map((a) => ({ ...a, answer: 'nonsense', correct: true })) });
    expect(out(forged).score).toBe(0);
  });
});
