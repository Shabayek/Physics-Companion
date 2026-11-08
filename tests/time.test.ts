import { describe, it, expect } from 'vitest';
import { daysBetween, fixedClock, isDateKey, toLocalDateKey } from '../src/lib/time';

describe('time', () => {
  it('toLocalDateKey uses the local calendar date', () => {
    const d = new Date(2026, 0, 5, 23, 59); // local time
    expect(toLocalDateKey(d.getTime())).toBe('2026-01-05');
    expect(toLocalDateKey(new Date(2026, 0, 6, 0, 1).getTime())).toBe('2026-01-06');
  });

  it('isDateKey validates format and real dates', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2024-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('26-1-1')).toBe(false);
    expect(isDateKey(20260101)).toBe(false);
  });

  it('daysBetween counts calendar days, across months/years/DST', () => {
    expect(daysBetween('2026-11-07', '2026-11-07')).toBe(0);
    expect(daysBetween('2026-11-07', '2026-11-08')).toBe(1);
    expect(daysBetween('2026-11-08', '2026-11-07')).toBe(-1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // EU DST change
    expect(() => daysBetween('bad', '2026-01-01')).toThrow();
  });

  it('fixedClock', () => {
    const c = fixedClock(1000);
    expect(c.now()).toBe(1000);
    c.set(5000);
    expect(c.now()).toBe(5000);
  });
});
