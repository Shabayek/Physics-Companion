import { describe, it, expect } from 'vitest';
import { recordActivity, viewStreak } from '../src/game/engine/streak';
import type { StreakState } from '../src/types';

const s = (current: number, longest: number, lastActiveDate: string | null): StreakState => ({ current, longest, lastActiveDate });

describe('recordActivity', () => {
  it('starts a streak', () => {
    expect(recordActivity(s(0, 0, null), '2026-11-07')).toEqual({ streak: s(1, 1, '2026-11-07'), change: 'started' });
    expect(recordActivity(s(0, 5, null), '2026-11-07').streak.longest).toBe(5);
  });

  it('is idempotent within a day', () => {
    const start = s(3, 3, '2026-11-07');
    expect(recordActivity(start, '2026-11-07')).toEqual({ streak: start, change: 'same-day' });
  });

  it('extends on the next calendar day, across month and year ends', () => {
    expect(recordActivity(s(3, 3, '2026-11-07'), '2026-11-08')).toEqual({ streak: s(4, 4, '2026-11-08'), change: 'extended' });
    expect(recordActivity(s(9, 12, '2026-11-30'), '2026-12-01').streak).toEqual(s(10, 12, '2026-12-01'));
    expect(recordActivity(s(1, 1, '2026-12-31'), '2027-01-01').change).toBe('extended');
    expect(recordActivity(s(1, 1, '2028-02-28'), '2028-02-29').change).toBe('extended');
  });

  it('resets after a missed day but keeps the longest', () => {
    expect(recordActivity(s(6, 6, '2026-11-05'), '2026-11-07')).toEqual({ streak: s(1, 6, '2026-11-07'), change: 'reset' });
  });

  it('ignores a clock set backwards (no loss, no gain)', () => {
    const start = s(4, 4, '2026-11-07');
    expect(recordActivity(start, '2026-11-05')).toEqual({ streak: start, change: 'clock-back' });
  });

  it('ignores an invalid date', () => {
    const start = s(2, 2, '2026-11-07');
    expect(recordActivity(start, 'garbage').streak).toBe(start);
  });
});

describe('viewStreak', () => {
  const streak = s(5, 8, '2026-11-07');
  it('active today', () => expect(viewStreak(streak, '2026-11-07')).toEqual({ days: 5, activeToday: true, atRisk: false }));
  it('at risk the next day', () => expect(viewStreak(streak, '2026-11-08')).toEqual({ days: 5, activeToday: false, atRisk: true }));
  it('broken after a missed day', () => expect(viewStreak(streak, '2026-11-09')).toEqual({ days: 0, activeToday: false, atRisk: false }));
  it('no streak yet', () => expect(viewStreak(s(0, 0, null), '2026-11-09').days).toBe(0));
  it('legacy streak without a date is not shown as current', () => expect(viewStreak(s(3, 3, null), '2026-11-09').days).toBe(0));
});
