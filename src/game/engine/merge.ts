// Three-way merge of two saves (cloud sync). `base` is the last version both sides agreed on
// (null if this device never synced). Rules:
//   - counters (Quanta, attempts, questions answered…) add up:   local + remote − base
//   - bests keep the best (max stars/scores/streaks, min boss time)
//   - sets are unions (worlds, collections, achievements, daily history)
//   - preferences: the side that changed since `base` wins (local wins if both changed)
//   - streaks: the most recent wins; streaks that continue each other across devices are joined
// Pure and deterministic; the result is a valid Progress.
import type { BossRecord, Difficulty, MissionProgress, Progress } from '../../types';
import { defaultProgress, DIFFICULTY_ORDER } from './progress';
import { daysBetween, isDateKey } from '../../lib/time';

type Counter = Record<string, number>;

/** local + remote − base, never below 0. */
function add(base: number | undefined, local: number | undefined, remote: number | undefined): number {
  return Math.max(0, (local ?? 0) + (remote ?? 0) - (base ?? 0));
}

/** Keys present on either side, in a stable order. */
function keys<T extends object>(...objects: (T | undefined)[]): string[] {
  return [...new Set(objects.flatMap((o) => (o ? Object.keys(o) : [])))].sort();
}

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Preference: whichever side changed since base (local wins ties). */
function pick<T>(base: T, local: T, remote: T): T {
  const same = (x: T, y: T) => JSON.stringify(x) === JSON.stringify(y);
  return same(local, base) ? remote : local;
}

function minDefined(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

function mergeMission(id: string, base: MissionProgress | undefined, l: MissionProgress | undefined, r: MissionProgress | undefined): MissionProgress {
  return {
    missionId: id,
    completed: !!(l?.completed || r?.completed),
    stars: Math.max(l?.stars ?? 0, r?.stars ?? 0) as MissionProgress['stars'],
    bestScore: Math.max(l?.bestScore ?? 0, r?.bestScore ?? 0),
    attempts: add(base?.attempts, l?.attempts, r?.attempts),
    lastPlayed: Math.max(l?.lastPlayed ?? 0, r?.lastPlayed ?? 0),
  };
}

function mergeBoss(base: BossRecord | undefined, l: BossRecord | undefined, r: BossRecord | undefined): BossRecord {
  return {
    defeated: !!(l?.defeated || r?.defeated),
    attempts: add(base?.attempts, l?.attempts, r?.attempts),
    bestTimeMs: minDefined(l?.bestTimeMs, r?.bestTimeMs),
    bestHeartsLeft: Math.max(l?.bestHeartsLeft ?? 0, r?.bestHeartsLeft ?? 0),
    defeatedAt: minDefined(l?.defeatedAt, r?.defeatedAt),
  };
}

function mergeStreak(l: Progress['streak'], r: Progress['streak']): Progress['streak'] {
  const longest = Math.max(l.longest, r.longest, l.current, r.current);
  const lDate = isDateKey(l.lastActiveDate) ? l.lastActiveDate : null;
  const rDate = isDateKey(r.lastActiveDate) ? r.lastActiveDate : null;
  if (!lDate || !rDate) {
    const only = lDate ? l : rDate ? r : l.current >= r.current ? l : r;
    return { ...only, longest: Math.max(longest, only.current) };
  }
  if (lDate === rDate) return { current: Math.max(l.current, r.current), longest, lastActiveDate: lDate };
  const [earlier, later] = lDate < rDate ? [l, r] : [r, l];
  // The later streak began the day after the earlier one's last day: they are one streak.
  const joined = daysBetween(earlier.lastActiveDate as string, later.lastActiveDate as string) === later.current;
  const current = joined ? earlier.current + later.current : later.current;
  return { current, longest: Math.max(longest, current), lastActiveDate: later.lastActiveDate };
}

function mergeCounters<T extends Counter>(base: T, l: T, r: T, maxKeys: readonly string[]): T {
  const out: Counter = {};
  for (const k of keys(l, r)) {
    out[k] = maxKeys.includes(k) ? Math.max(l[k] ?? 0, r[k] ?? 0) : add(base[k], l[k], r[k]);
  }
  return out as T;
}

const MAX_STATS = ['bestAnswerStreak', 'longestSurvival', 'bestChallengeCombo'] as const;

export function mergeProgress(base: Progress | null, local: Progress, remote: Progress): Progress {
  const b = base ?? defaultProgress(local.playerName);

  const missions: Progress['missions'] = {};
  for (const id of keys(local.missions, remote.missions)) {
    missions[id] = mergeMission(id, b.missions[id], local.missions[id], remote.missions[id]);
  }

  const bosses: Progress['bosses'] = {};
  for (const id of keys(local.bosses, remote.bosses)) {
    bosses[id] = mergeBoss(b.bosses[id], local.bosses[id], remote.bosses[id]);
  }

  const achievements: Progress['achievements'] = {};
  for (const id of keys(local.achievements, remote.achievements)) {
    const at = minDefined(local.achievements[id]?.unlockedAt, remote.achievements[id]?.unlockedAt);
    achievements[id] = { unlockedAt: at ?? 0 };
  }

  const history: Progress['daily']['history'] = {};
  for (const date of keys(local.daily.history, remote.daily.history)) {
    const l = local.daily.history[date];
    const r = remote.daily.history[date];
    const best = !l ? r : !r ? l : r.score > l.score ? r : l;
    if (best) history[date] = best;
  }
  const lastDates = [local.daily.lastCompletedDate, remote.daily.lastCompletedDate].filter((d): d is string => !!d).sort();

  const best: Progress['challenge']['best'] = {};
  for (const key of keys(local.challenge.best, remote.challenge.best)) {
    const l = local.challenge.best[key];
    const r = remote.challenge.best[key];
    const winner = !l ? r : !r ? l : r.score > l.score ? r : l;
    if (winner) best[key] = winner;
  }

  const worlds = new Set<Difficulty>([...local.unlockedWorlds, ...remote.unlockedWorlds]);

  return {
    version: Math.max(local.version, remote.version),
    playerName: pick(b.playerName, local.playerName, remote.playerName),
    ageMode: pick(b.ageMode, local.ageMode, remote.ageMode),
    theme: pick(b.theme, local.theme, remote.theme),
    locale: pick(b.locale, local.locale, remote.locale),
    unlockedWorlds: DIFFICULTY_ORDER.filter((w) => worlds.has(w)),
    missions,
    collection: {
      constants: union(local.collection.constants, remote.collection.constants),
      laws: union(local.collection.laws, remote.collection.laws),
      badges: union(local.collection.badges, remote.collection.badges),
      avatarItems: union(local.collection.avatarItems, remote.collection.avatarItems),
    },
    currency: add(b.currency, local.currency, remote.currency),
    settings: {
      audio: pick(b.settings.audio, local.settings.audio, remote.settings.audio),
      textSize: pick(b.settings.textSize, local.settings.textSize, remote.settings.textSize),
      reducedMotion: pick(b.settings.reducedMotion, local.settings.reducedMotion, remote.settings.reducedMotion),
      kidTone: pick(b.settings.kidTone, local.settings.kidTone, remote.settings.kidTone),
      challengeTiming: pick(b.settings.challengeTiming, local.settings.challengeTiming, remote.settings.challengeTiming),
    },
    stats: mergeCounters(
      b.stats as unknown as Counter,
      local.stats as unknown as Counter,
      remote.stats as unknown as Counter,
      MAX_STATS,
    ) as unknown as Progress['stats'],
    streak: mergeStreak(local.streak, remote.streak),
    daily: { lastCompletedDate: lastDates[lastDates.length - 1] ?? null, history },
    bosses,
    achievements,
    challenge: { runs: add(b.challenge.runs, local.challenge.runs, remote.challenge.runs), best },
  };
}

/** JSON with sorted keys — for comparing saves regardless of key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
