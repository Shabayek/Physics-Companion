// Daily activity streak over *local calendar days* (`YYYY-MM-DD`), robust to clock changes.
import type { StreakState } from '../../types';
import { daysBetween, isDateKey } from '../../lib/time';

export type StreakChange = 'started' | 'extended' | 'same-day' | 'reset' | 'clock-back';

/** Records activity on `today`. Idempotent within a day; a clock set backwards never corrupts the streak. */
export function recordActivity(streak: StreakState, today: string): { streak: StreakState; change: StreakChange } {
  if (!isDateKey(today)) return { streak, change: 'same-day' };
  const last = streak.lastActiveDate;
  if (!last || !isDateKey(last)) {
    return { streak: { current: 1, longest: Math.max(streak.longest, 1), lastActiveDate: today }, change: 'started' };
  }
  const gap = daysBetween(last, today);
  if (gap === 0) return { streak, change: 'same-day' };
  if (gap < 0) return { streak, change: 'clock-back' };
  if (gap === 1) {
    const current = streak.current + 1;
    return { streak: { current, longest: Math.max(streak.longest, current), lastActiveDate: today }, change: 'extended' };
  }
  return { streak: { current: 1, longest: Math.max(streak.longest, 1), lastActiveDate: today }, change: 'reset' };
}

export interface StreakView {
  /** Streak as it stands today (0 if broken). */
  days: number;
  /** Active today already. */
  activeToday: boolean;
  /** Streak alive but not yet extended today — play today to keep it. */
  atRisk: boolean;
}

/** How the streak looks on `today` (a missed day shows as 0 even before the next activity resets it). */
export function viewStreak(streak: StreakState, today: string): StreakView {
  const last = streak.lastActiveDate;
  if (!last || !isDateKey(last) || !isDateKey(today) || streak.current <= 0) return { days: 0, activeToday: false, atRisk: false };
  const gap = daysBetween(last, today);
  if (gap <= 0) return { days: streak.current, activeToday: true, atRisk: false };
  if (gap === 1) return { days: streak.current, activeToday: false, atRisk: true };
  return { days: 0, activeToday: false, atRisk: false };
}
