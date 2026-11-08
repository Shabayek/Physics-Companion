import { describe, it, expect } from 'vitest';
import {
  challengePool,
  challengeQuanta,
  challengeRules,
  comboMultiplier,
  endChallenge,
  questionLimitMs,
  replayChallenge,
  survivalLevel,
  worldsUpTo,
  CHALLENGE_QUANTA_CAP,
} from '../src/game/engine/challenge';
import { simulateChallenge } from './helpers/challenge';

describe('rules', () => {
  it('per mode and timing', () => {
    expect(challengeRules('blitz', 'standard')).toMatchObject({ totalMs: 60000, maxQuestions: null, lives: null, hintPenaltyMs: 5000 });
    expect(challengeRules('blitz', 'relaxed')).toMatchObject({ totalMs: 90000, hintPenaltyMs: 7500 });
    expect(challengeRules('blitz', 'untimed')).toMatchObject({ totalMs: null, maxQuestions: 20, hintPenaltyMs: 0 });
    expect(challengeRules('sprint', 'standard')).toMatchObject({ maxQuestions: 10, lives: null });
    expect(challengeRules('survival', 'standard')).toMatchObject({ lives: 3, maxQuestions: null });
  });

  it('question limits: Sprint 20 s; Survival gets faster every 5 questions; relaxed ×1.5; untimed none', () => {
    const sprint = challengeRules('sprint', 'standard');
    expect(questionLimitMs(sprint, 0)).toBe(20000);
    const survival = challengeRules('survival', 'standard');
    expect([0, 4, 5, 10, 15, 20, 50].map((i) => questionLimitMs(survival, i))).toEqual([30000, 30000, 25000, 20000, 15000, 12000, 12000]);
    expect(questionLimitMs(challengeRules('survival', 'relaxed'), 0)).toBe(45000);
    expect(questionLimitMs(challengeRules('sprint', 'untimed'), 0)).toBeNull();
    expect(questionLimitMs(challengeRules('blitz', 'standard'), 0)).toBeNull();
    expect([0, 4, 5, 12].map(survivalLevel)).toEqual([1, 1, 2, 3]);
  });

  it('combo multiplier grows 10% per step up to ×2', () => {
    expect([0, 1, 5, 10, 25].map(comboMultiplier)).toEqual([1, 1.1, 1.5, 2, 2]);
  });
});

describe('pools', () => {
  it('deterministic, right sizes, only unlocked worlds', () => {
    expect(challengePool('sprint', 'beginner', 's')).toEqual(challengePool('sprint', 'beginner', 's'));
    expect(challengePool('sprint', 'beginner', 's')).toHaveLength(10);
    expect(challengePool('blitz', 'beginner', 's')).toHaveLength(60);
    expect(worldsUpTo('advanced')).toEqual(['beginner', 'intermediate', 'advanced']);
    const ids = challengePool('survival', 'expert', 's').map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Survival gets harder as you go (when the tier has harder questions)', () => {
    const pool = challengePool('survival', 'expert', 'x');
    const avg = (from: number, to: number) => pool.slice(from, to).reduce((s, q) => s + q.difficulty, 0) / (to - from);
    expect(pool.slice(0, 10).every((q) => q.difficulty === 1)).toBe(true);
    expect(avg(20, 40)).toBeGreaterThan(avg(0, 10));
    expect(pool.slice(40, 60).every((q) => q.difficulty === 3)).toBe(true);
  });
});

describe('runs', () => {
  it('Sprint: 10 questions, faster answers and combos score more', () => {
    const fast = simulateChallenge('sprint', 'standard', 'beginner', 'a', () => ({ correct: true, timeMs: 2000 }));
    expect(fast.state).toMatchObject({ status: 'over', endReason: 'complete', correct: 10, bestCombo: 10 });
    const slow = simulateChallenge('sprint', 'standard', 'beginner', 'a', () => ({ correct: true, timeMs: 18000 }));
    expect(fast.state.score).toBeGreaterThan(slow.state.score);
    const broken = simulateChallenge('sprint', 'standard', 'beginner', 'a', (i) => ({ correct: i !== 5, timeMs: 2000 }));
    expect(broken.state.score).toBeLessThan(fast.state.score - 10); // lost more than one question's points (combo reset)
  });

  it('points: (10 × difficulty + speed bonus) × combo', () => {
    const run = simulateChallenge('sprint', 'standard', 'beginner', 'a', () => ({ correct: true, timeMs: 0 }));
    // Beginner questions are difficulty 1; an instant answer earns the full +5 speed bonus.
    expect(run.state.answers.map((a) => a.points)).toEqual([15, 17, 18, 20, 21, 23, 24, 26, 27, 29]);
  });

  it('per-question timeouts count as wrong, including time lost to hints', () => {
    const r = simulateChallenge('sprint', 'standard', 'beginner', 'a', (i) =>
      i === 0 ? { correct: true, timeMs: 21000 } : i === 1 ? { correct: true, timeMs: 16000, hints: 1 } : i === 2 ? { correct: true, timeMs: 14000, hints: 1 } : null,
    );
    expect(r.state.answers.map((a) => [a.correct, a.timedOut])).toEqual([[false, true], [false, true], [true, false]]);
    // Timer granularity: 20.2 s is still within the grace period.
    const grace = simulateChallenge('sprint', 'standard', 'beginner', 'a', (i) => (i === 0 ? { correct: true, timeMs: 20200 } : null));
    expect(grace.state.answers[0]?.timedOut).toBe(false);
  });

  it('Survival ends after 3 misses', () => {
    const r = simulateChallenge('survival', 'standard', 'beginner', 'b', (i) => ({ correct: i % 3 !== 2 }));
    expect(r.state).toMatchObject({ status: 'over', endReason: 'lives', lives: 0, correct: 6 });
    expect(r.state.answers).toHaveLength(9);
  });

  it('Blitz: the clock (answer time + hint penalties) decides; a late answer does not count', () => {
    const r = simulateChallenge('blitz', 'standard', 'beginner', 'c', () => ({ correct: true, timeMs: 7000 }));
    expect(r.state).toMatchObject({ status: 'over', endReason: 'time' });
    expect(r.state.answers).toHaveLength(8); // 8 × 7 s = 56 s; the 9th would end at 63 s
    const hinted = simulateChallenge('blitz', 'standard', 'beginner', 'c', () => ({ correct: true, timeMs: 7000, hints: 1 }));
    expect(hinted.state.answers).toHaveLength(5); // 12 s each
    const ended = endChallenge(simulateChallenge('blitz', 'standard', 'beginner', 'c', (i) => (i < 3 ? { correct: true } : null)).state, 'time');
    expect(ended).toMatchObject({ status: 'over', endReason: 'time' });
  });

  it('untimed: no clock, hints cost points instead', () => {
    const plain = simulateChallenge('blitz', 'untimed', 'beginner', 'd', () => ({ correct: true, timeMs: 600000 }));
    expect(plain.state).toMatchObject({ status: 'over', endReason: 'complete', correct: 20 });
    const hinted = simulateChallenge('blitz', 'untimed', 'beginner', 'd', () => ({ correct: true, timeMs: 600000, hints: 2 }));
    expect(hinted.state.score).toBeLessThan(plain.state.score);
  });

  it('Quanta: a tenth of the score, capped, only with a correct answer', () => {
    const good = simulateChallenge('sprint', 'standard', 'beginner', 'a', () => ({ correct: true, timeMs: 0 })).state;
    expect(good.score).toBe(220);
    expect(challengeQuanta(good)).toBe(22);
    const long = simulateChallenge('blitz', 'untimed', 'beginner', 'a', () => ({ correct: true })).state;
    expect(long.score).toBeGreaterThan(CHALLENGE_QUANTA_CAP * 10);
    expect(challengeQuanta(long)).toBe(CHALLENGE_QUANTA_CAP);
    const bad = simulateChallenge('sprint', 'standard', 'beginner', 'a', () => ({ correct: false })).state;
    expect(challengeQuanta(bad)).toBe(0);
  });
});

describe('replayChallenge (validation)', () => {
  it('reproduces a run exactly', () => {
    const sim = simulateChallenge('survival', 'relaxed', 'beginner', 'r', (i) => ({ correct: i % 4 !== 3, timeMs: 3000 + i * 100 }));
    const replay = replayChallenge('survival', 'relaxed', 'beginner', 'r', sim.inputs, 'quit');
    expect(replay.valid && replay.state).toEqual(sim.state);
  });

  it('re-grades forged answers and rejects mismatched or extra answers', () => {
    const sim = simulateChallenge('sprint', 'standard', 'beginner', 'r', () => ({ correct: false }));
    const forged = replayChallenge('sprint', 'standard', 'beginner', 'r', sim.inputs.map((a) => ({ ...a, correct: true })), 'quit');
    expect(forged.valid && forged.state.score).toBe(0);
    expect(replayChallenge('sprint', 'standard', 'beginner', 'other-seed', sim.inputs, 'quit')).toMatchObject({ valid: false });
    const extra = [...sim.inputs, ...sim.inputs.slice(0, 1)];
    expect(replayChallenge('sprint', 'standard', 'beginner', 'r', extra, 'quit')).toMatchObject({ valid: false, reason: 'More answers than the run allows' });
  });

  it('a run stopped by the player or the clock keeps its reason', () => {
    const sim = simulateChallenge('blitz', 'standard', 'beginner', 'r', (i) => (i < 4 ? { correct: true } : null));
    const r = replayChallenge('blitz', 'standard', 'beginner', 'r', sim.inputs, 'time');
    expect(r.valid && r.state.endReason).toBe('time');
  });
});
