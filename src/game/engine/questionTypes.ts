// Types and helpers for seeded question generators. Kept free of data imports so that
// content modules (src/data/questions) can depend on it without an import cycle.
import type { Difficulty, TopicId } from '../../types';
import type { Rng } from '../../lib/rng';

export interface GeneratedQuestion {
  prompt: string;
  type: 'numeric' | 'mcq' | 'truefalse';
  /** Exact value for numeric questions (never pre-rounded); option text otherwise. */
  answer: number | string;
  options?: string[];
  unit?: string;
  /** Rounding the player is asked for (decimal places). Numeric only; default 2. */
  decimals?: number;
  /** Relative tolerance override for numeric answers (default 1%). */
  tolerance?: number;
  /** Full worked solution. */
  explanation: string;
  /** Nudge → formula → worked first step. */
  hints: [string, string, string];
}

/**
 * A generator is split into `params` (random choices) and `build` (pure physics), so tests
 * can check `build` with known inputs and `params` for determinism and ranges.
 */
export interface QuestionGenerator<P> {
  id: string;
  topic: TopicId;
  world: Difficulty;
  difficulty: 1 | 2 | 3;
  params(rng: Rng): P;
  build(params: P): GeneratedQuestion;
}

/** Type-erased generator as stored in the registry. */
export interface AnyQuestionGenerator {
  id: string;
  topic: TopicId;
  world: Difficulty;
  difficulty: 1 | 2 | 3;
  create(rng: Rng): GeneratedQuestion;
}

export function defineGenerator<P>(g: QuestionGenerator<P>): QuestionGenerator<P> & AnyQuestionGenerator {
  return { ...g, create: (rng: Rng) => g.build(g.params(rng)) };
}

/** Number formatting used in prompts, hints and answers (en-US grouping, fixed decimals). */
export function fmt(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Compact number formatting for inputs in prompts: no trailing zeros. */
export function num(value: number, maxDecimals = 4): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}
