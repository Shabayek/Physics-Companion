import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { gameNow, useGameStore } from '../../store/useGameStore';
import { useNow } from '../../lib/useNow';
import {
  applyChallengeAnswer,
  challengeBestKey,
  challengePool,
  challengeRules,
  challengeTier,
  endChallenge,
  questionLimitMs,
  startChallenge,
  survivalLevel,
  CHALLENGE_MODES,
  CHALLENGE_TIMINGS,
  type ChallengeInput,
  type ChallengeMode,
  type ChallengeState,
  type ChallengeTiming,
} from '../../game/engine/challenge';
import { freeHintsFor, HINT_PENALTY, paidHints } from '../../game/engine/hints';
import { correctAnswerText, isAnswerCorrect } from '../../game/engine/quiz';
import type { ChallengeOutcome } from '../../game/engine/events';
import type { QuizQuestion } from '../../types';
import { ChallengeQuestion } from './ChallengeQuestion';
import { describeRules } from './rulesText';

const MODE_INFO: Record<ChallengeMode, { name: string; icon: string }> = {
  blitz: { name: 'Blitz', icon: '⚡' },
  sprint: { name: 'Sprint', icon: '🏃' },
  survival: { name: 'Survival', icon: '❤️' },
};

const TIMING_LABEL: Record<ChallengeTiming, string> = {
  standard: 'Standard',
  relaxed: 'Relaxed (×1.5 time)',
  untimed: 'Untimed',
};

function isMode(value: string | undefined): value is ChallengeMode {
  return !!value && (CHALLENGE_MODES as string[]).includes(value);
}

export default function ChallengePage() {
  const { mode } = useParams();
  if (mode === undefined) return <ChallengeHub />;
  if (!isMode(mode)) {
    return (
      <div className="max-w-3xl mx-auto glass p-6">
        <p>Unknown challenge mode.</p>
        <Link to="/challenge" className="btn mt-3 inline-block">All challenges</Link>
      </div>
    );
  }
  return <ChallengeRunPage key={mode} mode={mode} />;
}

function ChallengeHub() {
  const progress = useGameStore((s) => s.progress);
  const setSettings = useGameStore((s) => s.setSettings);
  const timing = progress.settings.challengeTiming;
  const tier = challengeTier(progress);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Challenge Mode</h1>
      <p className="opacity-80">
        Race the clock with questions from every world up to <span className="capitalize">{tier}</span>. Build combos for up to ×2 points.
      </p>
      <fieldset className="glass p-4">
        <legend className="font-semibold px-1">Timing</legend>
        <div className="flex flex-wrap gap-2 mt-1">
          {CHALLENGE_TIMINGS.map((t) => (
            <label key={t} className={`option ${timing === t ? 'selected' : ''}`}>
              <input type="radio" name="challenge-timing" value={t} checked={timing === t} onChange={() => setSettings({ challengeTiming: t })} />
              <span>{TIMING_LABEL[t]}</span>
            </label>
          ))}
        </div>
        <p className="text-xs opacity-70 mt-2">Personal bests are kept separately for each timing.</p>
      </fieldset>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CHALLENGE_MODES.map((m) => {
          const best = progress.challenge.best[challengeBestKey(m, timing)];
          return (
            <section key={m} className="glass p-5 space-y-2 flex flex-col" aria-labelledby={`mode-${m}`}>
              <h2 id={`mode-${m}`} className="text-xl font-bold">
                <span aria-hidden="true">{MODE_INFO[m].icon}</span> {MODE_INFO[m].name}
              </h2>
              <p className="text-sm opacity-80 flex-1">{describeRules(m, timing)}</p>
              <p className="text-sm" data-testid={`best-${m}`}>
                Best: {best ? `${best.score} pts (${best.correct}/${best.answered})` : '—'}
              </p>
              <Link to={`/challenge/${m}`} className="btn primary text-center" aria-label={`Start ${MODE_INFO[m].name}`}>
                Start
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface Active {
  pool: QuizQuestion[];
  run: ChallengeState;
  startedAt: number;
  shownAt: number;
  hintsShown: number;
  flash: { correct: boolean; points: number; answer: string } | null;
}

function ChallengeRunPage({ mode }: { mode: ChallengeMode }) {
  const dispatch = useGameStore((s) => s.dispatch);
  const ageMode = useGameStore((s) => s.progress.ageMode);
  const timing = useGameStore((s) => s.progress.settings.challengeTiming);
  const navigate = useNavigate();
  const [active, setActive] = useState<Active | null>(null);
  const [outcome, setOutcome] = useState<{ result: ChallengeOutcome; pool: QuizQuestion[] } | null>(null);
  const freeHints = freeHintsFor(ageMode);

  const start = useCallback(() => {
    const { progress } = useGameStore.getState();
    const timing = progress.settings.challengeTiming;
    const tier = challengeTier(progress);
    const seed = `${mode}:${timing}:run${progress.challenge.runs + 1}`;
    const now = gameNow();
    setOutcome(null);
    setActive({ pool: challengePool(mode, tier, seed), run: startChallenge(mode, timing, tier, seed), startedAt: now, shownAt: now, hintsShown: 0, flash: null });
  }, [mode]);

  const finish = useCallback(
    (run: ChallengeState, pool: QuizQuestion[], reason: 'time' | 'quit') => {
      const answers: ChallengeInput[] = run.answers.map(({ points: _p, ...a }) => a);
      const result = dispatch({ type: 'CHALLENGE_FINISHED', mode: run.mode, timing: run.timing, tier: run.tier, seed: run.seed, answers, endReason: reason });
      if (result.outcome.kind === 'challenge') setOutcome({ result: result.outcome, pool });
      setActive(null);
    },
    [dispatch],
  );

  if (outcome) {
    return <ChallengeResults result={outcome.result} pool={outcome.pool} onAgain={start} onBack={() => navigate('/challenge')} />;
  }
  if (!active) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Link to="/challenge" className="btn inline-block">← All challenges</Link>
        <div className="glass p-6 space-y-3 text-center">
          <h1 className="text-3xl font-bold">
            <span aria-hidden="true">{MODE_INFO[mode].icon}</span> {MODE_INFO[mode].name}
          </h1>
          <p className="opacity-80">{describeRules(mode, timing)}</p>
          <p className="text-sm opacity-70">Timing: {TIMING_LABEL[timing]} · Keys 1–4 answer multiple-choice questions.</p>
          <button className="btn primary" onClick={start}>Go!</button>
        </div>
      </div>
    );
  }
  return <ChallengeRun active={active} setActive={setActive} freeHints={freeHints} onFinish={finish} />;
}

function ChallengeRun({
  active,
  setActive,
  freeHints,
  onFinish,
}: {
  active: Active;
  setActive: (a: Active) => void;
  freeHints: number;
  onFinish: (run: ChallengeState, pool: QuizQuestion[], reason: 'time' | 'quit') => void;
}) {
  const now = useNow(100);
  const { run, pool, hintsShown } = active;
  const rules = challengeRules(run.mode, run.timing);
  const question = pool[run.index];
  const limitMs = questionLimitMs(rules, run.index);
  const penaltyNow = paidHints(hintsShown, freeHints) * rules.hintPenaltyMs;
  const pastPenalties = run.answers.reduce((sum, a) => sum + paidHints(a.hintsUsed, a.freeHints) * rules.hintPenaltyMs, 0);
  const totalLeft = rules.totalMs === null ? null : rules.totalMs - (now - active.startedAt) - pastPenalties - penaltyNow;
  const questionLeft = limitMs === null ? null : limitMs - (now - active.shownAt) - penaltyNow;
  const busy = useRef(false);

  const submit = useCallback(
    (answer: string, timedOut = false) => {
      if (busy.current || !question) return;
      busy.current = true;
      const t = gameNow();
      const input: ChallengeInput = {
        questionId: question.id,
        answer,
        correct: !timedOut && isAnswerCorrect(question, answer),
        hintsUsed: hintsShown,
        freeHints,
        timeMs: Math.max(0, t - active.shownAt),
        ...(timedOut ? { timedOut: true } : {}),
      };
      const next = applyChallengeAnswer(run, pool, input);
      const last = next.answers[next.answers.length - 1];
      if (next.status === 'over') {
        onFinish(next, pool, 'quit');
        return;
      }
      setActive({
        ...active,
        run: next,
        shownAt: t,
        hintsShown: 0,
        flash: last ? { correct: last.correct, points: last.points, answer: correctAnswerText(question) } : null,
      });
    },
    [active, freeHints, hintsShown, onFinish, pool, question, run, setActive],
  );

  // Release the double-submit guard once the next question is on screen.
  useEffect(() => {
    busy.current = false;
  }, [run.index]);

  // Timers are derived from timestamps; act when they run out.
  useEffect(() => {
    if (busy.current) return;
    if (totalLeft !== null && totalLeft <= 0) {
      busy.current = true;
      onFinish(endChallenge(run, 'time'), pool, 'time');
    } else if (questionLeft !== null && questionLeft <= 0) {
      submit('', true);
    }
  }, [totalLeft, questionLeft, run, pool, onFinish, submit]);

  const timer = totalLeft !== null ? { left: totalLeft, total: rules.totalMs ?? 1, label: 'Time left' } : questionLeft !== null && limitMs ? { left: questionLeft, total: limitMs, label: 'Time for this question' } : null;
  const hintLabel = run.timing === 'untimed' ? `Hint (−${Math.round(HINT_PENALTY * 100)}% points)` : `Hint (−${Math.round(rules.hintPenaltyMs / 1000)} s)`;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="glass p-4 space-y-2" data-testid="challenge-hud">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">
            <span aria-hidden="true">{MODE_INFO[run.mode].icon}</span> {MODE_INFO[run.mode].name}
          </h1>
          <span className="font-semibold" aria-label={`Score: ${run.score}`}>Score {run.score}</span>
          <span aria-label={`Combo multiplier ${(1 + 0.1 * Math.min(run.combo, 10)).toFixed(1)}`}>Combo ×{(1 + 0.1 * Math.min(run.combo, 10)).toFixed(1)}</span>
          {run.lives !== null && (
            <span role="img" aria-label={`Lives: ${run.lives} of ${rules.lives}`}>
              {'❤️'.repeat(Math.max(0, run.lives))}
              {'🤍'.repeat(Math.max(0, (rules.lives ?? 0) - run.lives))}
            </span>
          )}
          <span className="text-sm opacity-80">
            {run.mode === 'sprint'
              ? `Question ${run.index + 1} of ${rules.maxQuestions}`
              : run.mode === 'survival'
                ? `Level ${survivalLevel(run.index)} · Question ${run.index + 1}`
                : rules.maxQuestions
                  ? `Question ${run.index + 1} of ${rules.maxQuestions}`
                  : `Question ${run.index + 1}`}
          </span>
        </div>
        {timer && <TimerBar {...timer} />}
        <p className="text-sm min-h-5" aria-live="polite" data-testid="challenge-flash">
          {active.flash && (active.flash.correct ? `✓ +${active.flash.points}` : `✗ Answer: ${active.flash.answer}`)}
        </p>
      </div>
      {question && (
        <div className="glass p-6">
          <ChallengeQuestion
            key={`${run.seed}:${run.index}`}
            question={question}
            hintsShown={hintsShown}
            hintLabel={hintLabel}
            onHint={() => setActive({ ...active, hintsShown: hintsShown + 1 })}
            onSubmit={(a) => submit(a)}
          />
        </div>
      )}
      <div className="text-right">
        <button className="btn ghost text-sm" onClick={() => { busy.current = true; onFinish(endChallenge(run, 'quit'), pool, 'quit'); }}>
          ⏹ End run
        </button>
      </div>
    </div>
  );
}

function TimerBar({ left, total, label }: { left: number; total: number; label: string }) {
  const secs = Math.max(0, Math.ceil(left / 1000));
  const [announce, setAnnounce] = useState('');
  const lastAnnounced = useRef<number | null>(null);
  useEffect(() => {
    if ((secs === 10 || secs === 5) && lastAnnounced.current !== secs) {
      lastAnnounced.current = secs;
      setAnnounce(`${secs} seconds left`);
    }
  }, [secs]);
  const ratio = Math.max(0, Math.min(1, left / total));
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span role="timer" aria-live="off" aria-label={`${label}: ${secs} seconds`}>{secs} s</span>
      </div>
      <div className={`timer-bar ${ratio < 0.25 ? 'low' : ''}`} aria-hidden="true">
        <div style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="sr-only" aria-live="polite">{announce}</span>
    </div>
  );
}

const END_TEXT: Record<ChallengeOutcome['endReason'], string> = {
  time: 'Time’s up!',
  lives: 'Out of lives!',
  complete: 'Run complete!',
  quit: 'Run ended',
};

function ChallengeResults({ result, pool, onAgain, onBack }: { result: ChallengeOutcome; pool: QuizQuestion[]; onAgain: () => void; onBack: () => void }) {
  const byId = new Map(pool.map((q) => [q.id, q]));
  const accuracy = result.answered > 0 ? Math.round((result.correct / result.answered) * 100) : 0;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="glass p-6 space-y-2 text-center" data-testid="challenge-result">
        <p className="opacity-80">{END_TEXT[result.endReason]}</p>
        <h1 className="text-3xl font-bold">
          {MODE_INFO[result.mode].name}: {result.score} points
        </h1>
        {result.newBest && <p className="font-semibold">🏅 New personal best!{result.previousBest !== null && ` (was ${result.previousBest})`}</p>}
        <p className="text-sm opacity-80">
          Correct: {result.correct}/{result.answered} ({accuracy}%) · Best combo: {result.bestCombo} · Timing: {TIMING_LABEL[result.timing]}
        </p>
        {result.quanta > 0 && <p className="text-sm">Quanta earned: {result.quanta}</p>}
        <div className="flex gap-3 justify-center pt-2">
          <button className="btn primary" onClick={onAgain}>Play again</button>
          <button className="btn" onClick={onBack}>All challenges</button>
        </div>
      </div>
      {result.answers.length > 0 && (
        <details className="glass p-4">
          <summary className="cursor-pointer font-semibold">Review your answers ({result.answers.length})</summary>
          <ol className="space-y-3 mt-3">
            {result.answers.map((a, i) => {
              const q = byId.get(a.questionId);
              if (!q) return null;
              return (
                <li key={i} className={`feedback ${a.correct ? 'feedback-correct' : 'feedback-wrong'}`}>
                  <p className="font-semibold">{a.correct ? '✓' : '✗'} {q.prompt}</p>
                  <p className="text-sm">
                    Your answer: {a.timedOut ? '(time ran out)' : a.answer || '—'}
                    {!a.correct && ` · Correct: ${correctAnswerText(q)}`}
                    {a.points > 0 && ` · +${a.points}`}
                  </p>
                  <p className="text-sm opacity-80">{q.explanation}</p>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </div>
  );
}
