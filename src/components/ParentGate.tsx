import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { createRng } from '../lib/rng';
import { gameNow } from '../store/useGameStore';

/**
 * A simple parental gate ("ask a grown-up") shown in Kid mode before actions that involve personal
 * data, such as linking an email address.
 */
export function ParentGate({ children, label }: { children: ReactNode; label: string }) {
  const [question] = useState(() => {
    const rng = createRng(`gate:${gameNow()}`);
    return { a: rng.int(6, 9), b: rng.int(6, 9) };
  });
  const [input, setInput] = useState('');
  const [passed, setPassed] = useState(false);
  const [wrong, setWrong] = useState(false);
  const inputId = useId();

  if (passed) return <>{children}</>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (Number(input.trim()) === question.a * question.b) setPassed(true);
    else {
      setWrong(true);
      setInput('');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2" aria-label={`Grown-up check: ${label}`}>
      <p className="text-sm">👪 Please ask a grown-up to continue. What is {question.a} × {question.b}?</p>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={inputId}>Answer</label>
        <input id={inputId} className="answer-input" inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="btn">Continue</button>
      </div>
      {wrong && <p className="text-sm" role="alert">That’s not right — please ask a grown-up.</p>}
    </form>
  );
}
