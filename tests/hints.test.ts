import { describe, it, expect } from 'vitest';
import { answerCredit, freeHintsFor, hintCostLabel, paidHints } from '../src/game/engine/hints';
import { computeScore, scoreAnswers } from '../src/game/engine/scoring';
import type { AnswerRecord } from '../src/types';

const rec = (correct: boolean, hintsUsed = 0, freeHints = 0, timeMs = 5000): AnswerRecord => ({
  questionId: 'q',
  answer: 'a',
  correct,
  hintsUsed,
  freeHints,
  timeMs,
});

describe('hints', () => {
  it('Kid mode gets the first hint free', () => {
    expect(freeHintsFor('kid')).toBe(1);
    expect(freeHintsFor('standard')).toBe(0);
    expect(paidHints(2, 1)).toBe(1);
    expect(paidHints(0, 1)).toBe(0);
  });

  it('each paid hint costs 25% of the question, never below 25%, wrong answers earn 0', () => {
    expect(answerCredit(true, 0, 0)).toBe(1);
    expect(answerCredit(true, 1, 0)).toBe(0.75);
    expect(answerCredit(true, 2, 0)).toBe(0.5);
    expect(answerCredit(true, 3, 0)).toBe(0.25);
    expect(answerCredit(true, 1, 1)).toBe(1);
    expect(answerCredit(true, 3, 1)).toBe(0.5);
    expect(answerCredit(false, 0, 0)).toBe(0);
  });

  it('button label shows the cost', () => {
    expect(hintCostLabel(0, 1)).toBe('Free hint');
    expect(hintCostLabel(1, 1)).toBe('Hint (−25%)');
    expect(hintCostLabel(0, 0)).toBe('Hint (−25%)');
  });
});

describe('scoreAnswers', () => {
  it('no hints: perfect quiz is 3★ and "perfect"', () => {
    const s = scoreAnswers([rec(true), rec(true), rec(true), rec(true)]);
    expect(s.stars).toBe(3);
    expect(s.bonuses).toContain('perfect');
  });

  it('hints lower points and can lower stars (using every hint cannot give 3★)', () => {
    const noHints = scoreAnswers([rec(true), rec(true), rec(true), rec(true)]);
    const oneHint = scoreAnswers([rec(true, 1), rec(true), rec(true), rec(true)]);
    const allHints = scoreAnswers([rec(true, 3), rec(true, 3), rec(true, 3), rec(true, 3)]);
    expect(oneHint.points).toBeLessThan(noHints.points);
    expect(oneHint.stars).toBe(3); // 3.75 / 4 ≥ 90%
    expect(oneHint.bonuses).toContain('all-correct');
    expect(oneHint.bonuses).not.toContain('perfect');
    expect(allHints.stars).toBe(0); // 1 / 4 = 25%
  });

  it('free (Kid mode) hints cost nothing', () => {
    expect(scoreAnswers([rec(true, 1, 1), rec(true, 1, 1), rec(true, 1, 1)])).toEqual(scoreAnswers([rec(true), rec(true), rec(true)]));
  });

  it('time is the sum of answering times', () => {
    const fast = scoreAnswers([rec(true, 0, 0, 1000), rec(true, 0, 0, 1000)]);
    const slow = scoreAnswers([rec(true, 0, 0, 14000), rec(true, 0, 0, 14000)]);
    expect(fast.speedBonus).toBeGreaterThan(slow.speedBonus);
    expect(fast).toEqual(computeScore(2, 2, 2, 2));
  });
});
