import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { QuizQuestion } from '../../types';
import { MAX_HINTS } from '../../game/engine/hints';

interface Props {
  question: QuizQuestion;
  hintsShown: number;
  hintLabel: string;
  onHint: () => void;
  onSubmit: (answer: string) => void;
}

/**
 * Fast-play question: choices are buttons (one click/keypress answers; keys 1–9 are shortcuts),
 * numeric answers submit with Enter. No feedback step — challenge runs keep moving.
 */
export function ChallengeQuestion({ question, hintsShown, hintLabel, onHint, onSubmit }: Props) {
  const [input, setInput] = useState('');
  const firstRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  // Latest submit handler without re-subscribing the key listener on every timer tick.
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);
  const uid = useId();
  const isChoice = question.type === 'mcq' || question.type === 'truefalse';
  const options = question.options ?? [];
  const hints = (question.hints ?? []).slice(0, MAX_HINTS);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const choiceOptions = isChoice ? question.options : undefined;
  useEffect(() => {
    if (!choiceOptions) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      const opt = Number.isInteger(n) && n >= 1 ? choiceOptions[n - 1] : undefined;
      if (opt !== undefined) {
        e.preventDefault();
        submitRef.current(opt);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choiceOptions]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() !== '') onSubmit(input);
  };

  return (
    <div className="space-y-3">
      <h2 id={`${uid}-q`} className="text-lg font-semibold">{question.prompt}</h2>
      {isChoice ? (
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-labelledby={`${uid}-q`}>
          {options.map((opt, i) => (
            <button
              key={opt}
              ref={i === 0 ? (el) => { firstRef.current = el; } : undefined}
              type="button"
              className="option text-left"
              onClick={() => onSubmit(opt)}
              aria-keyshortcuts={String(i + 1)}
            >
              <span className="opacity-60 mr-1" aria-hidden="true">{i + 1}.</span> {opt}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-center gap-2">
          <label htmlFor={`${uid}-input`} className="sr-only">
            Your answer{question.unit ? ` in ${question.unit}` : ''}
          </label>
          <input
            id={`${uid}-input`}
            ref={(el) => { firstRef.current = el; }}
            className="answer-input"
            inputMode="decimal"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Your answer"
          />
          {question.unit && <span className="opacity-80">{question.unit}</span>}
          <button type="submit" className="btn primary" disabled={input.trim() === ''}>Submit</button>
        </form>
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
          {hintsShown < hints.length && (
            <button type="button" className="btn ghost text-sm" onClick={onHint}>
              💡 {hintLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
