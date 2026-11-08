// Challenge mode: timed runs (Blitz, Sprint, Survival) as a pure state machine.
//
// The UI measures wall-clock time; the engine only needs each answer's `timeMs`, so a whole run can
// be replayed and re-scored from (mode, timing, tier, seed, answers) — locally by the reducer and,
// later, by the server. Because wall time ≥ the sum of answer times, a run the UI accepted always
// replays to the same result.
import type { AnswerRecord, Difficulty, Progress, QuizQuestion } from '../../types';
import { buildQuestionSet } from './questions';
import { DIFFICULTY_ORDER } from './progress';
import { answerCredit, paidHints } from './hints';
import { isAnswerCorrect } from './quiz';

export type ChallengeMode = 'blitz' | 'sprint' | 'survival';
export type ChallengeTiming = 'standard' | 'relaxed' | 'untimed';
export type ChallengeEndReason = 'time' | 'lives' | 'complete' | 'quit';

export const CHALLENGE_MODES: ChallengeMode[] = ['blitz', 'sprint', 'survival'];
export const CHALLENGE_TIMINGS: ChallengeTiming[] = ['standard', 'relaxed', 'untimed'];

/** Multiplier applied to every time limit. */
export const TIMING_FACTOR: Record<Exclude<ChallengeTiming, 'untimed'>, number> = { standard: 1, relaxed: 1.5 };
/** Timer granularity allowance when checking per-question limits on replay. */
export const TIMEOUT_GRACE_MS = 250;
export const HINT_PENALTY_MS = 5000;
export const MAX_COMBO_STEPS = 10;
export const COMBO_STEP = 0.1;
export const MAX_SPEED_BONUS = 5;

const BLITZ_MS = 60_000;
const BLITZ_UNTIMED_QUESTIONS = 20;
const SPRINT_QUESTIONS = 10;
const SPRINT_QUESTION_MS = 20_000;
const SURVIVAL_LIVES = 3;
const SURVIVAL_QUESTIONS_PER_LEVEL = 5;
const SURVIVAL_LEVEL_MS = [30_000, 25_000, 20_000, 15_000, 12_000];

export interface ChallengeRules {
  mode: ChallengeMode;
  timing: ChallengeTiming;
  /** Total run time (Blitz), or null. */
  totalMs: number | null;
  /** Question cap, or null for unlimited. */
  maxQuestions: number | null;
  lives: number | null;
  /** Time lost per paid hint (timed runs). Untimed runs lose 25% of the question's points instead. */
  hintPenaltyMs: number;
}

export function challengeRules(mode: ChallengeMode, timing: ChallengeTiming): ChallengeRules {
  const factor = timing === 'untimed' ? null : TIMING_FACTOR[timing];
  const hintPenaltyMs = factor ? HINT_PENALTY_MS * factor : 0;
  switch (mode) {
    case 'blitz':
      return { mode, timing, totalMs: factor ? BLITZ_MS * factor : null, maxQuestions: factor ? null : BLITZ_UNTIMED_QUESTIONS, lives: null, hintPenaltyMs };
    case 'sprint':
      return { mode, timing, totalMs: null, maxQuestions: SPRINT_QUESTIONS, lives: null, hintPenaltyMs };
    case 'survival':
      return { mode, timing, totalMs: null, maxQuestions: null, lives: SURVIVAL_LIVES, hintPenaltyMs };
  }
}

/** Per-question time limit for the question at `index` (null = no limit). */
export function questionLimitMs(rules: ChallengeRules, index: number): number | null {
  if (rules.timing === 'untimed') return null;
  const factor = TIMING_FACTOR[rules.timing];
  if (rules.mode === 'sprint') return SPRINT_QUESTION_MS * factor;
  if (rules.mode === 'survival') {
    const level = Math.min(SURVIVAL_LEVEL_MS.length - 1, Math.floor(index / SURVIVAL_QUESTIONS_PER_LEVEL));
    return (SURVIVAL_LEVEL_MS[level] as number) * factor;
  }
  return null;
}

/** Survival level (1-based) for the question at `index`. */
export function survivalLevel(index: number): number {
  return Math.floor(index / SURVIVAL_QUESTIONS_PER_LEVEL) + 1;
}

/** Worlds used by challenge runs: every world up to the highest unlocked one. */
export function challengeTier(progress: Progress): Difficulty {
  return [...DIFFICULTY_ORDER].reverse().find((w) => progress.unlockedWorlds.includes(w)) ?? 'beginner';
}

export function worldsUpTo(tier: Difficulty): Difficulty[] {
  return DIFFICULTY_ORDER.slice(0, DIFFICULTY_ORDER.indexOf(tier) + 1);
}

/** Deterministic question order for a run. Survival gets harder in segments. */
export function challengePool(mode: ChallengeMode, tier: Difficulty, seed: string): QuizQuestion[] {
  const worlds = worldsUpTo(tier);
  if (mode === 'sprint') return buildQuestionSet({ worlds, count: SPRINT_QUESTIONS, seed: `${seed}:sprint`, generatedRatio: 0.5 });
  if (mode === 'blitz') return buildQuestionSet({ worlds, count: 60, seed: `${seed}:blitz`, generatedRatio: 0.3 });
  // Survival: easy → medium → hard (falls back to any difficulty where a tier has none).
  const segments: { count: number; min: 1 | 2 | 3; max: 1 | 2 | 3 }[] = [
    { count: 10, min: 1, max: 1 },
    { count: 10, min: 1, max: 2 },
    { count: 20, min: 2, max: 3 },
    { count: 60, min: 3, max: 3 },
  ];
  const used = new Set<string>();
  const pool: QuizQuestion[] = [];
  segments.forEach((seg, i) => {
    const opts = { worlds, count: seg.count, seed: `${seed}:survival${i}`, generatedRatio: 0.5, excludeIds: used };
    let part = buildQuestionSet({ ...opts, minDifficulty: seg.min, maxDifficulty: seg.max });
    if (part.length < seg.count) part = buildQuestionSet(opts);
    for (const q of part) used.add(q.id);
    pool.push(...part);
  });
  return pool;
}

export interface ChallengeAnswer extends AnswerRecord {
  /** The per-question time limit ran out (counts as wrong). */
  timedOut: boolean;
  points: number;
}

export interface ChallengeState {
  mode: ChallengeMode;
  timing: ChallengeTiming;
  tier: Difficulty;
  seed: string;
  /** Index of the current question in the pool. */
  index: number;
  score: number;
  combo: number;
  bestCombo: number;
  lives: number | null;
  correct: number;
  /** Sum of answering time + hint penalties (what the Blitz clock is checked against). */
  elapsedMs: number;
  answers: ChallengeAnswer[];
  status: 'running' | 'over';
  endReason: ChallengeEndReason | null;
}

export function startChallenge(mode: ChallengeMode, timing: ChallengeTiming, tier: Difficulty, seed: string): ChallengeState {
  const rules = challengeRules(mode, timing);
  return { mode, timing, tier, seed, index: 0, score: 0, combo: 0, bestCombo: 0, lives: rules.lives, correct: 0, elapsedMs: 0, answers: [], status: 'running', endReason: null };
}

export function comboMultiplier(combo: number): number {
  return 1 + COMBO_STEP * Math.min(Math.max(0, combo), MAX_COMBO_STEPS);
}

export interface ChallengeInput extends AnswerRecord {
  timedOut?: boolean;
}

/** Points for one correct answer. */
export function challengePoints(q: QuizQuestion, rules: ChallengeRules, input: ChallengeInput, combo: number, limitMs: number | null): number {
  const penaltyMs = paidHints(input.hintsUsed, input.freeHints) * rules.hintPenaltyMs;
  const speed = limitMs ? Math.round(MAX_SPEED_BONUS * Math.max(0, limitMs - input.timeMs - penaltyMs) / limitMs) : 0;
  const credit = rules.timing === 'untimed' ? answerCredit(true, input.hintsUsed, input.freeHints) : 1;
  return Math.round((10 * q.difficulty * credit + speed) * comboMultiplier(combo));
}

/**
 * Applies one answer to the current question. `input.correct` is trusted as given (re-grade untrusted
 * input first — `replayChallenge` does). Timeouts and Blitz clock overruns are enforced here.
 */
export function applyChallengeAnswer(state: ChallengeState, pool: readonly QuizQuestion[], input: ChallengeInput): ChallengeState {
  if (state.status !== 'running') return state;
  const rules = challengeRules(state.mode, state.timing);
  const q = pool[state.index];
  if (!q) return { ...state, status: 'over', endReason: 'complete' };

  const penaltyMs = paidHints(input.hintsUsed, input.freeHints) * rules.hintPenaltyMs;
  const timeMs = Math.max(0, input.timeMs);
  const elapsedMs = state.elapsedMs + timeMs + penaltyMs;
  // Blitz: an answer given after the clock ran out does not count.
  if (rules.totalMs !== null && elapsedMs > rules.totalMs + TIMEOUT_GRACE_MS) {
    return { ...state, status: 'over', endReason: 'time' };
  }

  const limitMs = questionLimitMs(rules, state.index);
  const timedOut = !!input.timedOut || (limitMs !== null && timeMs + penaltyMs > limitMs + TIMEOUT_GRACE_MS);
  const correct = input.correct && !timedOut;
  const points = correct ? challengePoints(q, rules, { ...input, timeMs }, state.combo, limitMs) : 0;
  const combo = correct ? state.combo + 1 : 0;
  const lives = state.lives !== null && !correct ? state.lives - 1 : state.lives;

  const next: ChallengeState = {
    ...state,
    index: state.index + 1,
    score: state.score + points,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    lives,
    correct: state.correct + (correct ? 1 : 0),
    elapsedMs,
    answers: [...state.answers, { ...input, timeMs, correct, timedOut, points }],
  };
  if (lives !== null && lives <= 0) return { ...next, status: 'over', endReason: 'lives' };
  if (rules.maxQuestions !== null && next.index >= rules.maxQuestions) return { ...next, status: 'over', endReason: 'complete' };
  if (next.index >= pool.length) return { ...next, status: 'over', endReason: 'complete' };
  return next;
}

export function endChallenge(state: ChallengeState, reason: 'time' | 'quit'): ChallengeState {
  return state.status === 'over' ? state : { ...state, status: 'over', endReason: reason };
}

export type ChallengeReplay = { valid: true; state: ChallengeState } | { valid: false; reason: string };

/** Rebuilds and re-scores a run from its answer log, re-grading every answer. */
export function replayChallenge(
  mode: ChallengeMode,
  timing: ChallengeTiming,
  tier: Difficulty,
  seed: string,
  answers: readonly ChallengeInput[],
  endReason: 'time' | 'quit',
): ChallengeReplay {
  const pool = challengePool(mode, tier, seed);
  let state = startChallenge(mode, timing, tier, seed);
  for (const a of answers) {
    if (state.status !== 'running') return { valid: false, reason: 'More answers than the run allows' };
    const q = pool[state.index];
    if (!q || a.questionId !== q.id) return { valid: false, reason: 'Answers do not match the run' };
    state = applyChallengeAnswer(state, pool, { ...a, correct: isAnswerCorrect(q, a.answer) });
  }
  return { valid: true, state: endChallenge(state, endReason) };
}

export function challengeBestKey(mode: ChallengeMode, timing: ChallengeTiming): string {
  return `${mode}:${timing}`;
}

/** Quanta for a run: a tenth of the score, capped, and only for runs with a correct answer. */
export const CHALLENGE_QUANTA_CAP = 30;
export function challengeQuanta(state: ChallengeState): number {
  return state.correct > 0 ? Math.min(CHALLENGE_QUANTA_CAP, Math.floor(state.score / 10)) : 0;
}
