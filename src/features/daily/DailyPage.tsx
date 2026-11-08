import { useState } from 'react';
import { Link } from 'react-router-dom';
import { gameNow, useGameStore } from '../../store/useGameStore';
import { useNow } from '../../lib/useNow';
import { formatCountdown, toLocalDateKey } from '../../lib/time';
import {
  buildDailyChallenge,
  dailyTier,
  msUntilNextLocalMidnight,
  DAILY_BASE_QUANTA,
  DAILY_QUESTIONS,
  MAX_STREAK_BONUS,
  PERFECT_DAILY_BONUS,
  STREAK_BONUS_PER_DAY,
  STREAK_CHEST_EVERY,
  STREAK_CHEST_QUANTA,
} from '../../game/engine/daily';
import { recordActivity, viewStreak } from '../../game/engine/streak';
import { freeHintsFor } from '../../game/engine/hints';
import type { DailyOutcome } from '../../game/engine/events';
import { QuizRunner } from '../../components/quiz/QuizRunner';
import type { AnswerRecord, Difficulty, QuizQuestion } from '../../types';

interface Run {
  date: string;
  tier: Difficulty;
  questions: QuizQuestion[];
}

export default function DailyPage() {
  const progress = useGameStore((s) => s.progress);
  const dispatch = useGameStore((s) => s.dispatch);
  const now = useNow(1000);
  const today = toLocalDateKey(now);
  const tier = dailyTier(progress);
  const done = progress.daily.history[today];
  const [run, setRun] = useState<Run | null>(null);
  const [outcome, setOutcome] = useState<DailyOutcome | null>(null);

  const streak = viewStreak(progress.streak, today);
  const streakIfPlayed = recordActivity(progress.streak, today).streak.current;
  const bonusPct = Math.round(Math.min(MAX_STREAK_BONUS, STREAK_BONUS_PER_DAY * streakIfPlayed) * 100);
  const daysToChest = STREAK_CHEST_EVERY - (streakIfPlayed % STREAK_CHEST_EVERY || STREAK_CHEST_EVERY);

  const start = () => {
    // The date is fixed when the challenge starts, so finishing after midnight still counts.
    const date = toLocalDateKey(gameNow());
    setOutcome(null);
    setRun({ date, tier, questions: buildDailyChallenge(date, tier) });
  };

  const finish = (answers: AnswerRecord[]) => {
    if (!run) return;
    const result = dispatch({ type: 'DAILY_CHALLENGE_SUBMITTED', date: run.date, tier: run.tier, answers });
    if (result.outcome.kind === 'daily') setOutcome(result.outcome);
    setRun(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/" className="btn">← Home</Link>
        <h1 className="text-2xl font-bold">Daily Challenge</h1>
        <span className="text-sm opacity-80">
          {today} · <span className="capitalize">{tier}</span> tier
        </span>
      </div>

      {run ? (
        <QuizRunner questions={run.questions} freeHints={freeHintsFor(progress.ageMode)} onFinish={finish} />
      ) : outcome ? (
        <DailyResult outcome={outcome} streakDays={progress.streak.current} nextInMs={msUntilNextLocalMidnight(now)} onPractice={start} />
      ) : (
        <div className="glass p-6 space-y-4">
          {done ? (
            <>
              <p className="font-semibold">✓ You completed today’s challenge: {done.correct}/{done.total} correct, {done.score} points.</p>
              <p className="text-sm opacity-80">
                A new challenge arrives in <span role="timer" aria-live="off">{formatCountdown(msUntilNextLocalMidnight(now))}</span>. You can
                practise today’s questions again — practice runs give no rewards but still count for your streak.
              </p>
              <button className="btn" onClick={start}>Practice again</button>
            </>
          ) : (
            <>
              <p>
                {DAILY_QUESTIONS} questions from every world up to <span className="capitalize">{tier}</span>. Everyone at your tier gets the
                same questions today.
              </p>
              <table className="reward-table" aria-label="Reward preview">
                <tbody>
                  <tr><td>Base reward (scaled by accuracy)</td><td>up to {DAILY_BASE_QUANTA[tier]}</td></tr>
                  <tr><td>Streak bonus (day {streakIfPlayed})</td><td>+{bonusPct}%</td></tr>
                  <tr><td>Perfect run</td><td>+{Math.round(DAILY_BASE_QUANTA[tier] * PERFECT_DAILY_BONUS)}</td></tr>
                  <tr>
                    <td>🎁 Streak chest (every {STREAK_CHEST_EVERY} days)</td>
                    <td>{daysToChest === 0 ? `+${STREAK_CHEST_QUANTA} today!` : `in ${daysToChest} day${daysToChest === 1 ? '' : 's'}`}</td>
                  </tr>
                </tbody>
              </table>
              {streak.atRisk && <p className="font-semibold">🔥 Play today to keep your {streak.days}-day streak!</p>}
              <button className="btn primary" onClick={start}>Start challenge</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DailyResult({ outcome, streakDays, nextInMs, onPractice }: { outcome: DailyOutcome; streakDays: number; nextInMs: number; onPractice: () => void }) {
  const { reward } = outcome;
  return (
    <div className="glass p-6 space-y-3 text-center" data-testid="daily-result">
      <h2 className="text-2xl font-bold">{outcome.practice ? 'Practice complete' : 'Daily challenge complete!'}</h2>
      <p>
        Score: {outcome.score.points} · Correct: {outcome.correct}/{outcome.total}
      </p>
      <p aria-label={`${outcome.score.stars} of 3 stars`}>
        {'★'.repeat(outcome.score.stars)}
        {'☆'.repeat(3 - outcome.score.stars)}
      </p>
      {outcome.practice ? (
        <p className="text-sm opacity-80">Practice runs give no rewards — come back tomorrow for a new challenge.</p>
      ) : (
        <table className="reward-table" aria-label="Rewards">
          <tbody>
            <tr><td>Base reward</td><td>{reward.base}</td></tr>
            <tr><td>Streak bonus (+{reward.streakBonusPct}%)</td><td>{reward.streakBonus}</td></tr>
            {reward.perfectBonus > 0 && <tr><td>Perfect run</td><td>{reward.perfectBonus}</td></tr>}
            {reward.chest > 0 && <tr><td>🎁 Streak chest</td><td>{reward.chest}</td></tr>}
            <tr className="total"><td>Total Quanta</td><td>{reward.total}</td></tr>
          </tbody>
        </table>
      )}
      <p className="text-sm">🔥 Streak: {streakDays} day{streakDays === 1 ? '' : 's'}</p>
      <p className="text-sm opacity-80">
        Next challenge in <span role="timer" aria-live="off">{formatCountdown(nextInMs)}</span>
      </p>
      <div className="flex gap-3 justify-center">
        <button className="btn" onClick={onPractice}>Practice again</button>
        <Link to="/" className="btn primary">Home</Link>
      </div>
    </div>
  );
}
