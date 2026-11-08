// Client-side mirror of the server's plausibility rules (supabase/migrations/*_leaderboard.sql).
// Values are derived from the game engine where possible; a unit test checks that they match the
// constants tagged /*NAME*/ in the SQL, so the client never submits a run the server would reject.
import { challengeRules, comboMultiplier, HINT_PENALTY_MS, MAX_COMBO_STEPS, MAX_SPEED_BONUS, TIMEOUT_GRACE_MS } from '../../game/engine/challenge';
import { computeScore } from '../../game/engine/scoring';
import { DAILY_QUESTIONS } from '../../game/engine/daily';
import { BOSS_BASE_DAMAGE, BOSS_MAX_HEARTS, BOSS_MAX_HP, BOSS_STAGE_POOL_SIZE } from '../../game/engine/boss';
import type { ScoreSubmission } from './types';

export const LEADERBOARD_RULES = {
  NAME_MIN: 3,
  NAME_MAX: 24,
  RATE_LIMIT_PER_MINUTE: 10,
  MAX_ANSWERS: 200,
  MAX_ANSWER_MS: 600_000,
  /** A correct answer faster than this is not humanly plausible. */
  MIN_CORRECT_ANSWER_MS: 400,
  MAX_POINTS_PER_ANSWER: Math.round((10 * 3 + MAX_SPEED_BONUS) * comboMultiplier(MAX_COMBO_STEPS)),
  BLITZ_MS: challengeRules('blitz', 'standard').totalMs ?? 0,
  BLITZ_MS_RELAXED: challengeRules('blitz', 'relaxed').totalMs ?? 0,
  BLITZ_UNTIMED_QUESTIONS: challengeRules('blitz', 'untimed').maxQuestions ?? 0,
  HINT_PENALTY_MS,
  HINT_PENALTY_MS_RELAXED: challengeRules('blitz', 'relaxed').hintPenaltyMs,
  TIMEOUT_GRACE_MS,
  SPRINT_QUESTIONS: challengeRules('sprint', 'standard').maxQuestions ?? 0,
  SURVIVAL_LIVES: challengeRules('survival', 'standard').lives ?? 0,
  DAILY_QUESTIONS,
  /** A perfect, instant daily: all correct, full speed bonus, full streak. */
  MAX_DAILY_SCORE: computeScore(DAILY_QUESTIONS, DAILY_QUESTIONS, 0, DAILY_QUESTIONS).points,
  BOSS_MAX_HEARTS,
  BOSS_MIN_HITS: BOSS_MAX_HP / BOSS_BASE_DAMAGE,
  /** Every stage pool used up (3 × 12) is the most a battle can take. */
  BOSS_MAX_ANSWERS: 3 * BOSS_STAGE_POOL_SIZE,
} as const;

const R = LEADERBOARD_RULES;

/** Returns null if the server should accept the submission, otherwise the code it would return. */
export function checkSubmission(s: ScoreSubmission): string | null {
  if (s.clientId.length < 8 || s.clientId.length > 64 || s.seed.length > 200) return 'invalid';
  if (s.log.length !== s.answered || s.answered < 1 || s.answered > R.MAX_ANSWERS) return 'invalid_log';
  if (s.log.some((e) => !Number.isInteger(e.t) || e.t < 0 || e.t > R.MAX_ANSWER_MS || ![0, 1, 2, 3].includes(e.h))) return 'invalid_log';
  const correct = s.log.filter((e) => e.c).length;
  const time = s.log.reduce((sum, e) => sum + e.t, 0);
  if (correct !== s.correct || Math.abs(time - s.timeMs) > s.answered) return 'inconsistent';
  if (s.log.some((e) => e.c && e.t < R.MIN_CORRECT_ANSWER_MS)) return 'implausible';
  const hints = s.log.reduce((sum, e) => sum + e.h, 0);

  if (s.kind === 'challenge') {
    const m = /^challenge:(blitz|sprint|survival):(standard|relaxed|untimed)$/.exec(s.board);
    if (!m) return 'invalid_board';
    const [, mode, timing] = m;
    if (s.score > s.correct * R.MAX_POINTS_PER_ANSWER) return 'implausible';
    if (mode === 'blitz') {
      if (timing === 'untimed') {
        if (s.answered > R.BLITZ_UNTIMED_QUESTIONS) return 'implausible';
      } else {
        const total = timing === 'relaxed' ? R.BLITZ_MS_RELAXED : R.BLITZ_MS;
        const penalty = timing === 'relaxed' ? R.HINT_PENALTY_MS_RELAXED : R.HINT_PENALTY_MS;
        if (time + hints * penalty > total + R.TIMEOUT_GRACE_MS) return 'implausible';
      }
    } else if (mode === 'sprint') {
      if (s.answered > R.SPRINT_QUESTIONS) return 'implausible';
    } else if (s.answered - s.correct > R.SURVIVAL_LIVES) {
      return 'implausible';
    }
    return null;
  }
  if (s.kind === 'daily') {
    if (!/^daily:\d{4}-\d{2}-\d{2}:(beginner|intermediate|advanced|expert)$/.test(s.board)) return 'invalid_board';
    if (s.answered !== R.DAILY_QUESTIONS || s.score > R.MAX_DAILY_SCORE) return 'implausible';
    return null;
  }
  if (!/^boss:boss-(beginner|intermediate|advanced|expert)$/.test(s.board)) return 'invalid_board';
  if (s.score < 1 || s.score > R.BOSS_MAX_HEARTS || s.correct < R.BOSS_MIN_HITS || s.answered - s.correct !== R.BOSS_MAX_HEARTS - s.score || s.answered > R.BOSS_MAX_ANSWERS) {
    return 'implausible';
  }
  return null;
}

/** Player-facing explanation of a rejection code. */
export function describeRejection(code: string | undefined): string {
  switch (code) {
    case 'implausible':
      return 'This run looks impossible (for example answers faster than anyone can read), so it was not submitted.';
    case 'already_submitted':
      return 'You already submitted today’s daily challenge for this tier.';
    case 'stale':
      return 'This daily challenge is too old to submit.';
    case 'rate_limited':
      return 'Too many submissions in a minute — it will be retried shortly.';
    case 'no_profile':
      return 'Join the leaderboard to submit scores.';
    default:
      return 'The score could not be submitted.';
  }
}
