import type { AnswerRecord, ScoreResult } from '../../types';
import { answerCredit } from './hints';

/** Time budget per question before the speed bonus runs out. */
export const SPEED_BUDGET_PER_QUESTION_SEC = 15;
/** Max speed bonus per *correct* answer (answered instantly). */
export const MAX_SPEED_BONUS_PER_CORRECT = 5;
export const POINTS_PER_CORRECT = 10;
export const POINTS_PER_STREAK_STEP = 2;

export function pointsForAnswer(correct: boolean, difficulty: 1 | 2 | 3, speedBonus = 0, streak = 0): number {
  if (!correct) return 0;
  const base = difficulty * 10;
  const streakBonus = streak * 2;
  return base + speedBonus + streakBonus;
}

export function starsFromScore(score: number, maxScore: number): 0 | 1 | 2 | 3 {
  if (maxScore <= 0) return 0;
  const ratio = score / maxScore;
  if (ratio >= 0.9) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio >= 0.3) return 1;
  return 0;
}

/** Longest run of consecutive `true` values. */
export function longestRun(results: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = r ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Scores a completed quiz.
 * - Stars depend on (hint-adjusted) accuracy only, so a perfect quiz is always 3★ regardless of speed.
 * - Speed adds bonus points, proportional to the unused time budget and earned per correct answer.
 * - `streak` is the longest run of consecutive correct answers.
 * - `credit` is the hint-adjusted number of correct answers (defaults to `correctCount`, i.e. no hints).
 */
export function computeScore(
  correctCount: number,
  total: number,
  timeSec: number,
  streak: number,
  credit: number = correctCount,
): ScoreResult {
  const safeTotal = Math.max(0, Math.floor(total));
  const correct = Math.min(Math.max(0, Math.floor(correctCount)), safeTotal);
  const earned = Math.min(Math.max(0, Number.isFinite(credit) ? credit : correct), correct);
  const budget = safeTotal * SPEED_BUDGET_PER_QUESTION_SEC;
  const time = Number.isFinite(timeSec) && timeSec >= 0 ? timeSec : budget;
  const unusedRatio = budget > 0 ? Math.max(0, budget - time) / budget : 0;
  const speedBonus = Math.round(unusedRatio * MAX_SPEED_BONUS_PER_CORRECT * earned);
  const safeStreak = Math.min(Math.max(0, Math.floor(streak)), correct);

  const points = Math.round(earned * POINTS_PER_CORRECT) + speedBonus + safeStreak * POINTS_PER_STREAK_STEP;
  const stars = starsFromScore(earned, safeTotal);

  const bonuses: string[] = [];
  if (correct > 0 && budget > 0 && time <= budget / 2) bonuses.push('speed');
  if (safeStreak >= 3) bonuses.push('streak');
  if (safeTotal > 0 && correct === safeTotal) bonuses.push(earned === correct ? 'perfect' : 'all-correct');
  return { points, stars, streak: safeStreak, speedBonus, bonuses };
}

/** Scores a quiz from the QuizRunner's answer records (time = sum of answering times). */
export function scoreAnswers(answers: readonly AnswerRecord[]): ScoreResult {
  const correct = answers.filter((a) => a.correct).length;
  const credit = answers.reduce((sum, a) => sum + answerCredit(a.correct, a.hintsUsed, a.freeHints), 0);
  const timeSec = answers.reduce((sum, a) => sum + Math.max(0, a.timeMs), 0) / 1000;
  return computeScore(correct, answers.length, timeSec, longestRun(answers.map((a) => a.correct)), credit);
}
