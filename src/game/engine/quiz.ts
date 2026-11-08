import type { QuizQuestion } from '../../types';

const normalizeText = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Float slack for "exact" numeric answers. */
const EXACT = 1e-9;

/**
 * Parses a numeric answer. Accepts thousands separators ("4,900"), a decimal comma ("1,5"),
 * exponents ("3e8") and a trailing unit ("4 m/s"). Returns null if the text is not a number.
 */
export function parseNumericAnswer(text: string): number | null {
  // English thousands separators ("4,900" / "1,234,567.5") are removed first.
  if (/^\s*[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)/.test(text)) text = text.replace(/,(?=\d{3}(?!\d))/g, '');
  const match = /^\s*([-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[-+]?\d+)?)\s*(?:[^\d\s.,].*)?$/i.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/**
 * Grades a single answer. Pure and DOM-free so it can be shared by every quiz
 * surface (missions, bosses, daily, challenge) and by server-side validation.
 */
export function isAnswerCorrect(question: QuizQuestion, answer: string | undefined): boolean {
  if (answer === undefined) return false;
  if (question.type === 'numeric') {
    const value = parseNumericAnswer(answer);
    if (value === null) return false;
    const raw = question.answer;
    const target = typeof raw === 'number' ? raw : Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isFinite(target)) return false;
    // Accept if within the absolute tolerance (e.g. half a rounding step) OR the relative one (±x% of target).
    const allowed = Math.max(
      question.absTolerance ?? 0,
      (question.tolerance ?? 0) * Math.abs(target),
      EXACT * Math.max(1, Math.abs(target)),
    );
    return Math.abs(value - target) <= allowed;
  }
  const accepted = Array.isArray(question.answer) ? question.answer : [String(question.answer)];
  const given = normalizeText(answer);
  return accepted.some((a) => normalizeText(String(a)) === given);
}

/** Per-question correctness, in question order. */
export function gradeQuiz(questions: readonly QuizQuestion[], answers: Readonly<Record<string, string>>): boolean[] {
  return questions.map((q) => isAnswerCorrect(q, answers[q.id]));
}

/** The correct answer as shown to the player. */
export function correctAnswerText(question: QuizQuestion): string {
  if (question.answerText) return question.answerText;
  const a = Array.isArray(question.answer) ? (question.answer[0] ?? '') : String(question.answer);
  return question.unit ? `${a} ${question.unit}` : a;
}
