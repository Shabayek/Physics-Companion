// Answers for any question — shared by unit, UI and E2E tests.
import { correctAnswerText } from '../../src/game/engine/quiz';
import type { QuizQuestion } from '../../src/types';

/** A correct answer as a player would type/select it (numeric: the displayed value without unit). */
export function rightAnswer(q: QuizQuestion): string {
  return q.type === 'numeric' ? correctAnswerText(q).replace(` ${q.unit ?? ''}`, '').trim() : String(q.answer);
}

/** A definitely wrong answer. */
export function wrongAnswer(q: QuizQuestion): string {
  return q.type === 'numeric' ? '-999' : ((q.options ?? []).find((o) => o !== q.answer) ?? 'nope');
}
