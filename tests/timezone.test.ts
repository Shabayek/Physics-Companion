// Local-date logic under a real non-UTC timezone with DST (America/New_York).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toLocalDateKey } from '../src/lib/time';
import { msUntilNextLocalMidnight } from '../src/game/engine/daily';

let previous: string | undefined;
beforeAll(() => {
  previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  if (previous === undefined) delete process.env.TZ;
  else process.env.TZ = previous;
});

describe('local dates in America/New_York', () => {
  it('the local day differs from the UTC day late in the evening', () => {
    const t = Date.parse('2026-11-08T03:30:00Z'); // 22:30 EST on Nov 7
    expect(new Date(t).toISOString().slice(0, 10)).toBe('2026-11-08');
    expect(toLocalDateKey(t)).toBe('2026-11-07');
  });

  it('countdown to local midnight', () => {
    expect(msUntilNextLocalMidnight(Date.parse('2026-11-08T03:30:00Z'))).toBe(90 * 60 * 1000);
  });

  it('handles the 25-hour day when DST ends (Nov 1, 2026)', () => {
    const localMidnight = Date.parse('2026-11-01T04:00:00Z'); // 00:00 EDT
    expect(toLocalDateKey(localMidnight)).toBe('2026-11-01');
    expect(msUntilNextLocalMidnight(localMidnight)).toBe(25 * 3600 * 1000);
  });
});
