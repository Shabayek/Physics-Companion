import type { AgeMode } from '../../types';

/** Maximum hint tiers per question: nudge → formula → worked first step. */
export const MAX_HINTS = 3;
/** Credit lost on a question per *paid* hint. */
export const HINT_PENALTY = 0.25;
/** Minimum credit for a correct answer, however many hints were used. */
export const MIN_HINT_CREDIT = 0.25;

/** Free hints per question: Kid mode gets the first hint for free. */
export function freeHintsFor(ageMode: AgeMode): number {
  return ageMode === 'kid' ? 1 : 0;
}

export function paidHints(hintsUsed: number, freeHints: number): number {
  return Math.max(0, Math.floor(hintsUsed) - Math.max(0, Math.floor(freeHints)));
}

/** Credit (0–1) a question contributes to score and stars. */
export function answerCredit(correct: boolean, hintsUsed: number, freeHints: number): number {
  if (!correct) return 0;
  return Math.max(MIN_HINT_CREDIT, 1 - HINT_PENALTY * paidHints(hintsUsed, freeHints));
}

/** Label for the hint button, e.g. "Free hint" or "Hint (−25%)". */
export function hintCostLabel(hintsUsed: number, freeHints: number): string {
  return hintsUsed < freeHints ? 'Free hint' : `Hint (−${Math.round(HINT_PENALTY * 100)}%)`;
}
