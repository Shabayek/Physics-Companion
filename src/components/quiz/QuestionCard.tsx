import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { AnswerRecord, QuizQuestion } from '../../types';
import { correctAnswerText, isAnswerCorrect } from '../../game/engine/quiz';
import { hintCostLabel, MAX_HINTS } from '../../game/engine/hints';
import { gameNow } from '../../store/useGameStore';

export interface QuestionCardProps {
  question: QuizQuestion;
  /** Free hints for this question (Kid mode: 1). */
  freeHints?: number;
  /** Called once when the answer is checked. */
  onChecked?: (record: AnswerRecord) => void;
  /** Called when the player moves on after reading the feedback. */
  onNext: (record: AnswerRecord) => void;
  nextLabel?: string;
  /** Extra content shown after the feedback (e.g. boss damage). */
  afterFeedback?: ReactNode;
  /** Content above the question (progress, counters). */
  header?: ReactNode;
  /** Move focus to the question when it appears (for every question after the first). */
  autoFocus?: boolean;
  /** Clock — answering time excludes time spent reading feedback. */
  now?: () => number;
}

/**
 * A single question: answer → (hints) → check → feedback with explanation → next.
 * Remount it (change `key`) for each new question.
 */
export function QuestionCard({
  question,
  freeHints = 0,
  onChecked,
  onNext,
  nextLabel = 'Next question →',
  afterFeedback,
  header,
  autoFocus = false,
  now = gameNow,
}: QuestionCardProps) {
  const [input, setInput] = useState('');
  const [hintsShown, setHintsShown] = useState(0);
  const [checked, setChecked] = useState<AnswerRecord | null>(null);
  const shownAt = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const uid = useId();

  useEffect(() => {
    shownAt.current = now();
    if (autoFocus) headingRef.current?.focus();
  }, [autoFocus, now]);

  useEffect(() => {
    if (checked) nextRef.current?.focus();
  }, [checked]);

  const hints = (question.hints ?? []).slice(0, MAX_HINTS);
  const isChoice = question.type === 'mcq' || question.type === 'truefalse';

  const check = (e?: FormEvent) => {
    e?.preventDefault();
    if (checked || input.trim() === '') return;
    const record: AnswerRecord = {
      questionId: question.id,
      answer: input,
      correct: isAnswerCorrect(question, input),
      hintsUsed: hintsShown,
      freeHints,
      timeMs: Math.max(0, now() - shownAt.current),
    };
    setChecked(record);
    onChecked?.(record);
  };

  return (
    <section className="glass p-6 space-y-4" aria-labelledby={`${uid}-q`} data-testid="quiz-runner">
      {header}
      <h2 id={`${uid}-q`} ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
        {question.prompt}
      </h2>

      <form onSubmit={check} className="space-y-3">
        {isChoice ? (
          <fieldset className="grid gap-2 sm:grid-cols-2" disabled={!!checked}>
            <legend className="sr-only">Answer options</legend>
            {(question.options ?? []).map((opt) => {
              const state = checked ? (isAnswerCorrect(question, opt) ? 'right' : opt === input ? 'wrong' : '') : '';
              return (
                <label key={opt} className={`option ${input === opt ? 'selected' : ''} ${state}`}>
                  <input type="radio" name={`${uid}-opt`} value={opt} checked={input === opt} onChange={() => setInput(opt)} />
                  <span>{opt}</span>
                </label>
              );
            })}
          </fieldset>
        ) : (
          <div className="flex items-center gap-2">
            <label htmlFor={`${uid}-input`} className="sr-only">
              Your answer{question.unit ? ` in ${question.unit}` : ''}
            </label>
            <input
              id={`${uid}-input`}
              className="answer-input"
              inputMode={question.type === 'numeric' ? 'decimal' : 'text'}
              autoComplete="off"
              value={input}
              disabled={!!checked}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Your answer"
            />
            {question.unit && <span className="opacity-80">{question.unit}</span>}
          </div>
        )}

        {hints.length > 0 && (
          <div className="space-y-2">
            {hintsShown > 0 && (
              <ol className="hint-list" aria-label="Hints">
                {hints.slice(0, hintsShown).map((h, i) => (
                  <li key={i}>
                    <span className="font-semibold">Hint {i + 1}:</span> {h}
                  </li>
                ))}
              </ol>
            )}
            {!checked && hintsShown < hints.length && (
              <button type="button" className="btn ghost text-sm" onClick={() => setHintsShown((n) => n + 1)}>
                💡 {hintCostLabel(hintsShown, freeHints)}
              </button>
            )}
          </div>
        )}

        {!checked && (
          <button type="submit" className="btn primary" disabled={input.trim() === ''}>
            Check answer
          </button>
        )}
      </form>

      <div aria-live="polite">
        {checked && (
          <div className={`feedback ${checked.correct ? 'feedback-correct' : 'feedback-wrong'}`} data-testid="quiz-feedback">
            <p className="font-semibold">
              {checked.correct ? '✓ Correct!' : `✗ Not quite. Correct answer: ${correctAnswerText(question)}`}
            </p>
            <p className="text-sm opacity-90 mt-1">{question.explanation}</p>
          </div>
        )}
        {checked && afterFeedback}
      </div>
      {checked && (
        <button ref={nextRef} type="button" className="btn primary" onClick={() => onNext(checked)}>
          {nextLabel}
        </button>
      )}
    </section>
  );
}
