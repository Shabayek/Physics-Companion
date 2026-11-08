// Runtime schema for persisted/imported progress (save format v2).
//
// Two entry points:
//  - parseProgressStrict: for user-imported files. Missing fields get defaults,
//    but wrong types are reported as errors so we never silently load garbage.
//  - salvageProgress: for our own persisted state. Never throws; invalid parts are
//    repaired field-by-field (invalid mission entries are dropped, others kept).
// zod/mini: same validation engine, tree-shakable API (~8 KB gzip vs ~28 KB for classic zod).
import * as z from 'zod/mini';
import type { Progress } from '../../types';

export const CURRENT_PROGRESS_VERSION = 2;

const nonNegInt = () => z.int().check(z.minimum(0));
const nonNegNum = () => z.number().check(z.minimum(0));
const withDefault = <T extends z.ZodMiniType>(schema: T, value: z.util.NoUndefined<z.output<T>>) => z._default(schema, value);
const stars = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const difficulty = z.enum(['beginner', 'intermediate', 'advanced', 'expert']);
const dateKey = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));

const MissionProgressSchema = z.object({
  missionId: z.string(),
  completed: z.boolean(),
  stars,
  bestScore: nonNegNum(),
  attempts: nonNegInt(),
  lastPlayed: nonNegNum(),
});

const SettingsSchema = z.object({
  audio: withDefault(z.boolean(), true),
  textSize: withDefault(z.enum(['sm', 'md', 'lg']), 'md'),
  reducedMotion: withDefault(z.boolean(), false),
  kidTone: withDefault(z.boolean(), false),
  challengeTiming: withDefault(z.enum(['standard', 'relaxed', 'untimed']), 'standard'),
});

const CollectionSchema = z.object({
  constants: withDefault(z.array(z.string()), []),
  laws: withDefault(z.array(z.string()), []),
  badges: withDefault(z.array(z.string()), []),
  avatarItems: withDefault(z.array(z.string()), []),
});

const StatsSchema = z.object({
  quizzesTaken: withDefault(nonNegInt(), 0),
  questionsAnswered: withDefault(nonNegInt(), 0),
  questionsCorrect: withDefault(nonNegInt(), 0),
  perfectQuizzes: withDefault(nonNegInt(), 0),
  bestAnswerStreak: withDefault(nonNegInt(), 0),
  hintsUsed: withDefault(nonNegInt(), 0),
  hintFreeQuizzes: withDefault(nonNegInt(), 0),
  bossWinsWithoutHints: withDefault(nonNegInt(), 0),
  clutchBossWins: withDefault(nonNegInt(), 0),
  dailyChallengesCompleted: withDefault(nonNegInt(), 0),
  perfectDailies: withDefault(nonNegInt(), 0),
  perfectSprints: withDefault(nonNegInt(), 0),
  longestSurvival: withDefault(nonNegInt(), 0),
  bestChallengeCombo: withDefault(nonNegInt(), 0),
  quantaEarned: withDefault(nonNegNum(), 0),
});

const StreakSchema = z.object({
  current: withDefault(nonNegInt(), 0),
  longest: withDefault(nonNegInt(), 0),
  lastActiveDate: withDefault(z.nullable(dateKey), null),
});

const DailySchema = z.object({
  lastCompletedDate: withDefault(z.nullable(dateKey), null),
  history: withDefault(
    z.record(
      z.string(),
      z.object({
        score: nonNegNum(),
        correct: nonNegInt(),
        total: nonNegInt(),
        completedAt: nonNegNum(),
        tier: withDefault(difficulty, 'beginner'),
        stars: withDefault(stars, 0),
      }),
    ),
    {},
  ),
});

const BossSchema = z.object({
  defeated: withDefault(z.boolean(), false),
  attempts: withDefault(nonNegInt(), 0),
  bestTimeMs: withDefault(z.nullable(nonNegNum()), null),
  bestHeartsLeft: withDefault(nonNegInt(), 0),
  defeatedAt: withDefault(z.nullable(nonNegNum()), null),
});

const ChallengeSchema = z.object({
  runs: withDefault(nonNegInt(), 0),
  best: withDefault(
    z.record(
      z.string(),
      z.object({ score: nonNegNum(), at: nonNegNum(), correct: withDefault(nonNegInt(), 0), answered: withDefault(nonNegInt(), 0) }),
    ),
    {},
  ),
});

export const ProgressSchema = z.object({
  version: withDefault(z.number(), CURRENT_PROGRESS_VERSION),
  playerName: withDefault(z.string().check(z.trim(), z.minLength(1), z.maxLength(40)), 'Explorer'),
  ageMode: withDefault(z.enum(['kid', 'standard']), 'standard'),
  theme: withDefault(z.enum(['light', 'dark', 'high-contrast']), 'dark'),
  locale: withDefault(z.literal('en'), 'en'),
  unlockedWorlds: withDefault(z.array(difficulty), ['beginner']),
  missions: withDefault(z.record(z.string(), MissionProgressSchema), {}),
  collection: withDefault(CollectionSchema, { constants: [], laws: [], badges: [], avatarItems: [] }),
  currency: withDefault(nonNegNum(), 0),
  settings: withDefault(SettingsSchema, { audio: true, textSize: 'md', reducedMotion: false, kidTone: false, challengeTiming: 'standard' }),
  stats: withDefault(StatsSchema, {
    quizzesTaken: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    perfectQuizzes: 0,
    bestAnswerStreak: 0,
    hintsUsed: 0,
    hintFreeQuizzes: 0,
    bossWinsWithoutHints: 0,
    clutchBossWins: 0,
    dailyChallengesCompleted: 0,
    perfectDailies: 0,
    perfectSprints: 0,
    longestSurvival: 0,
    bestChallengeCombo: 0,
    quantaEarned: 0,
  }),
  streak: withDefault(StreakSchema, { current: 0, longest: 0, lastActiveDate: null }),
  daily: withDefault(DailySchema, { lastCompletedDate: null, history: {} }),
  bosses: withDefault(z.record(z.string(), BossSchema), {}),
  achievements: withDefault(z.record(z.string(), z.object({ unlockedAt: nonNegNum() })), {}),
  challenge: withDefault(ChallengeSchema, { runs: 0, best: {} }),
});

// Compile-time guarantee: anything the schema produces is a valid `Progress`.
// If a field is added to `Progress` but not to the schema, this line fails to typecheck.
export const schemaOutputIsProgress = (p: z.output<typeof ProgressSchema>): Progress => p;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Upgrades older save formats to the v2 shape (before schema validation).
 * v1 → v2: `streakDays` → `streak`, `dailyChallengeDate/Done` → `daily`,
 * and `stats` is back-filled from what v1 knew.
 */
export function upgradeLegacy(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version < 2) {
    if (!('streak' in raw) && typeof raw.streakDays === 'number' && raw.streakDays >= 0) {
      const n = Math.floor(raw.streakDays);
      out.streak = { current: n, longest: n, lastActiveDate: null };
    }
    if (!('daily' in raw) && raw.dailyChallengeDone === true && typeof raw.dailyChallengeDate === 'string') {
      out.daily = { lastCompletedDate: raw.dailyChallengeDate, history: {} };
    }
    if (!('stats' in raw)) {
      const missions = isRecord(raw.missions) ? Object.values(raw.missions) : [];
      const attempts = missions.reduce<number>(
        (sum, m) => sum + (isRecord(m) && typeof m.attempts === 'number' && m.attempts > 0 ? Math.floor(m.attempts) : 0),
        0,
      );
      const currency = typeof raw.currency === 'number' && raw.currency > 0 ? raw.currency : 0;
      out.stats = { quizzesTaken: attempts, quantaEarned: currency };
    }
  }
  delete out.streakDays;
  delete out.dailyChallengeDate;
  delete out.dailyChallengeDone;
  out.version = CURRENT_PROGRESS_VERSION;
  return out;
}

/** Invariants that the schema cannot express on its own. */
function normalize(p: Progress): Progress {
  const worlds = Array.from(new Set<Progress['unlockedWorlds'][number]>(['beginner', ...p.unlockedWorlds]));
  const dedupe = (a: string[]) => Array.from(new Set(a));
  const missions: Progress['missions'] = {};
  for (const [key, m] of Object.entries(p.missions)) missions[key] = { ...m, missionId: key };
  return {
    ...p,
    version: CURRENT_PROGRESS_VERSION,
    unlockedWorlds: worlds,
    missions,
    collection: {
      constants: dedupe(p.collection.constants),
      laws: dedupe(p.collection.laws),
      badges: dedupe(p.collection.badges),
      avatarItems: dedupe(p.collection.avatarItems),
    },
    streak: { ...p.streak, longest: Math.max(p.streak.longest, p.streak.current) },
  };
}

type SalvageResult = { ok: true; data: unknown } | { ok: false };

/** Recursively keeps every valid part of `value`, falling back to schema defaults. */
function salvage(schema: z.ZodMiniType, value: unknown): SalvageResult {
  const direct = schema.safeParse(value);
  if (direct.success) return { ok: true, data: direct.data };

  const inner = schema instanceof z.ZodMiniDefault ? (schema._zod.def.innerType as z.ZodMiniType) : schema;
  if (inner instanceof z.ZodMiniObject && isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(inner._zod.def.shape as Record<string, z.ZodMiniType>)) {
      const field = salvage(fieldSchema, value[key]);
      if (field.ok) {
        out[key] = field.data;
        continue;
      }
      const fallback = fieldSchema.safeParse(undefined);
      if (!fallback.success) return { ok: false };
      out[key] = fallback.data;
    }
    return { ok: true, data: out };
  }
  if (inner instanceof z.ZodMiniRecord && isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const item = salvage(inner._zod.def.valueType as z.ZodMiniType, entry);
      if (item.ok) out[key] = item.data;
    }
    return { ok: true, data: out };
  }
  return { ok: false };
}

/** Lenient load for our own persisted data. Never throws. */
export function salvageProgress(raw: unknown): Progress {
  const input = isRecord(raw) ? upgradeLegacy(raw) : {};
  const result = salvage(ProgressSchema, input);
  const parsed = result.ok ? (result.data as Progress) : ProgressSchema.parse({});
  return normalize(parsed);
}

export type ProgressParseResult = { ok: true; progress: Progress } | { ok: false; error: string };

/** Strict load for user-supplied files (import). */
export function parseProgressStrict(raw: unknown): ProgressParseResult {
  if (!isRecord(raw)) return { ok: false, error: 'The file does not contain a progress object.' };
  if (!('missions' in raw) && !('version' in raw)) {
    return { ok: false, error: 'This does not look like a Physics Companion save file.' };
  }
  const parsed = ProgressSchema.safeParse(upgradeLegacy(raw));
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return { ok: true, progress: normalize(parsed.data) };
}
