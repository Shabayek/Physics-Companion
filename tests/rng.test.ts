import { describe, it, expect } from 'vitest';
import { createRng, hashString } from '../src/lib/rng';

describe('rng', () => {
  it('hashString is stable and spreads similar inputs', () => {
    expect(hashString('2026-11-07')).toBe(hashString('2026-11-07'));
    expect(hashString('2026-11-07')).not.toBe(hashString('2026-11-08'));
    expect(hashString('')).toBe(0x811c9dc5);
  });

  it('same seed → same sequence; different seed → different sequence', () => {
    const a = createRng('daily:2026-11-07');
    const b = createRng('daily:2026-11-07');
    const c = createRng('daily:2026-11-08');
    const seqA = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(seqA);
  });

  it('next() stays in [0, 1) and int() in the inclusive range', () => {
    const r = createRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
      seen.add(n);
    }
    expect(seen.size).toBe(6);
    expect(r.int(5, 5)).toBe(5);
    expect([3, 4]).toContain(r.int(4, 3));
  });

  it('pick and shuffle', () => {
    const r = createRng(7);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = r.shuffle(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
    expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow();
  });
});
