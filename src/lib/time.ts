// Time utilities. Engine code never calls Date.now() directly: it receives `now`
// (epoch ms) as an argument so that it stays pure and testable. UI/store code
// obtains `now` from a Clock.

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A clock frozen at `ms` (advance it with `set`). Handy in tests. */
export function fixedClock(ms: number): Clock & { set(ms: number): void } {
  let current = ms;
  return {
    now: () => current,
    set: (v: number) => {
      current = v;
    },
  };
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar date in the player's *local* timezone, formatted `YYYY-MM-DD`. */
export function toLocalDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * Whole calendar days from `from` to `to` (both `YYYY-MM-DD`).
 * Computed on UTC midnights, so DST transitions never produce 23h/25h "days".
 */
export function daysBetween(from: string, to: string): number {
  if (!isDateKey(from) || !isDateKey(to)) throw new Error(`daysBetween: invalid date key (${from}, ${to})`);
  const toUtc = (key: string) => {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** `m:ss` for durations (e.g. boss clear times). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** `h:mm:ss` countdown text. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Short relative time, e.g. "just now", "5 min ago". */
export function timeAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
