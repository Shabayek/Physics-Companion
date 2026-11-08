import { Link } from 'react-router-dom';
import { useGameStore } from '../../store/useGameStore';
import { useNow } from '../../lib/useNow';
import { formatCountdown, toLocalDateKey } from '../../lib/time';
import { dailyReward, dailyTier, msUntilNextLocalMidnight, DAILY_BASE_QUANTA, DAILY_QUESTIONS } from '../../game/engine/daily';
import { recordActivity, viewStreak } from '../../game/engine/streak';

/** Home-page card: today's challenge, reward preview and countdown to the next one. */
export function DailyCard() {
  const progress = useGameStore((s) => s.progress);
  const now = useNow(1000);
  const today = toLocalDateKey(now);
  const tier = dailyTier(progress);
  const record = progress.daily.history[today];
  const streak = viewStreak(progress.streak, today);
  const streakIfPlayed = recordActivity(progress.streak, today).streak.current;
  const bonusPct = dailyReward(tier, [{ questionId: '', answer: '', correct: true, hintsUsed: 0, freeHints: 0, timeMs: 0 }], streakIfPlayed).streakBonusPct;

  return (
    <section className="glass daily-card p-5 space-y-2" aria-labelledby="daily-card-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="daily-card-title" className="font-semibold text-lg">📅 Daily Challenge</h3>
        <span className="text-sm opacity-80 capitalize">{tier} tier</span>
      </div>
      {record ? (
        <>
          <p>
            ✓ Completed today: {record.correct}/{record.total} correct ·{' '}
            <span aria-label={`${record.stars} of 3 stars`}>{'★'.repeat(record.stars)}{'☆'.repeat(3 - record.stars)}</span>
          </p>
          <p className="text-sm opacity-80">
            Next challenge in <span role="timer" aria-live="off">{formatCountdown(msUntilNextLocalMidnight(now))}</span>
          </p>
          <Link to="/daily" className="btn inline-block">Practice again</Link>
        </>
      ) : (
        <>
          <p className="text-sm opacity-80">
            {DAILY_QUESTIONS} questions · up to {DAILY_BASE_QUANTA[tier]} Quanta{bonusPct > 0 ? ` + ${bonusPct}% streak bonus` : ''} · perfect runs earn extra
          </p>
          {streak.atRisk && <p className="text-sm font-semibold">🔥 Play today to keep your {streak.days}-day streak!</p>}
          <Link to="/daily" className="btn primary inline-block">Start today’s challenge</Link>
        </>
      )}
    </section>
  );
}
