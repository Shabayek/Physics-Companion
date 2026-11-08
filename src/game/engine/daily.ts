// Daily challenge: 5 questions per local day. The set depends only on (date, tier), so every
// player at the same tier gets the same questions (needed for a fair daily leaderboard).
import type { AnswerRecord, Difficulty, Progress, QuizQuestion } from '../../types';
import { buildQuestionSet } from './questions';
import { DIFFICULTY_ORDER } from './progress';
import { answerCredit } from './hints';

export const DAILY_QUESTIONS = 5;
export const DAILY_BASE_QUANTA: Record<Difficulty, number> = { beginner: 20, intermediate: 30, advanced: 40, expert: 50 };
export const STREAK_BONUS_PER_DAY = 0.1;
export const MAX_STREAK_BONUS = 1;
export const PERFECT_DAILY_BONUS = 0.5;
export const STREAK_CHEST_EVERY = 7;
export const STREAK_CHEST_QUANTA = 100;
/** Daily history entries kept in the save. */
export const DAILY_HISTORY_LIMIT = 90;

/** The player's daily tier: their highest unlocked world. */
export function dailyTier(progress: Progress): Difficulty {
  return [...DIFFICULTY_ORDER].reverse().find((w) => progress.unlockedWorlds.includes(w)) ?? 'beginner';
}

export function dailySeed(date: string, tier: Difficulty): string {
  return `daily:${date}:${tier}`;
}

/** Questions for a day and tier, drawn from every world up to the tier. */
export function buildDailyChallenge(date: string, tier: Difficulty): QuizQuestion[] {
  const worlds = DIFFICULTY_ORDER.slice(0, DIFFICULTY_ORDER.indexOf(tier) + 1);
  return buildQuestionSet({ worlds, count: DAILY_QUESTIONS, seed: dailySeed(date, tier), generatedRatio: 0.6 });
}

export interface DailyReward {
  /** Base reward scaled by (hint-adjusted) accuracy. */
  base: number;
  streakBonus: number;
  /** Streak bonus as a percentage (0–100). */
  streakBonusPct: number;
  perfectBonus: number;
  chest: number;
  total: number;
}

export function dailyReward(tier: Difficulty, answers: readonly AnswerRecord[], streakDays: number): DailyReward {
  const total = answers.length;
  const credit = answers.reduce((sum, a) => sum + answerCredit(a.correct, a.hintsUsed, a.freeHints), 0);
  const ratio = total > 0 ? credit / total : 0;
  const base = Math.round(DAILY_BASE_QUANTA[tier] * ratio);
  const pct = Math.min(MAX_STREAK_BONUS, STREAK_BONUS_PER_DAY * Math.max(0, streakDays));
  const streakBonus = Math.round(base * pct);
  const perfect = total > 0 && credit === total;
  const perfectBonus = perfect ? Math.round(DAILY_BASE_QUANTA[tier] * PERFECT_DAILY_BONUS) : 0;
  const chest = base > 0 && streakDays > 0 && streakDays % STREAK_CHEST_EVERY === 0 ? STREAK_CHEST_QUANTA : 0;
  return { base, streakBonus, streakBonusPct: Math.round(pct * 100), perfectBonus, chest, total: base + streakBonus + perfectBonus + chest };
}

export function isDailyDone(progress: Progress, date: string): boolean {
  return !!progress.daily.history[date];
}

/** Milliseconds until the next local midnight (when a new daily challenge starts). */
export function msUntilNextLocalMidnight(now: number): number {
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next.getTime() - now);
}
