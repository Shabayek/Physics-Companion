import { describe, it, expect } from 'vitest';
import { ProgressSchema, parseProgressStrict, salvageProgress, CURRENT_PROGRESS_VERSION } from '../src/game/engine/schema';
import { defaultProgress, migrateProgress } from '../src/game/engine/progress';

/** A save exactly as the original v1 app wrote it. */
const V1_SAVE = {
  version: 1,
  playerName: 'Ada',
  ageMode: 'kid',
  theme: 'light',
  locale: 'en',
  unlockedWorlds: ['beginner', 'intermediate'],
  missions: {
    'b-speed': { missionId: 'b-speed', completed: true, stars: 2, bestScore: 40, attempts: 3, lastPlayed: 1700000000000 },
    'b-gravity': { missionId: 'b-gravity', completed: false, stars: 0, bestScore: 10, attempts: 1, lastPlayed: 1700000001000 },
  },
  collection: { constants: [], laws: [], badges: ['badge-b-speed'], avatarItems: [] },
  currency: 30,
  settings: { audio: false, textSize: 'lg', reducedMotion: true, kidTone: true },
  dailyChallengeDate: '2026-11-01',
  dailyChallengeDone: true,
  streakDays: 4,
};

describe('progress schema', () => {
  it('schema defaults equal defaultProgress()', () => {
    expect(ProgressSchema.parse({})).toEqual(defaultProgress());
  });

  it('defaultProgress round-trips through the strict parser', () => {
    const p = defaultProgress('Marie');
    expect(parseProgressStrict(JSON.parse(JSON.stringify(p)))).toEqual({ ok: true, progress: p });
  });
});

describe('v1 → v2 migration', () => {
  const migrated = migrateProgress(V1_SAVE);

  it('keeps all v1 data', () => {
    expect(migrated.playerName).toBe('Ada');
    expect(migrated.ageMode).toBe('kid');
    expect(migrated.theme).toBe('light');
    expect(migrated.unlockedWorlds).toEqual(['beginner', 'intermediate']);
    expect(migrated.missions).toEqual(V1_SAVE.missions);
    expect(migrated.collection.badges).toEqual(['badge-b-speed']);
    expect(migrated.currency).toBe(30);
    expect(migrated.settings).toEqual({ ...V1_SAVE.settings, challengeTiming: 'standard' });
  });

  it('moves legacy fields into the new structures and drops them', () => {
    expect(migrated.version).toBe(CURRENT_PROGRESS_VERSION);
    expect(migrated.streak).toEqual({ current: 4, longest: 4, lastActiveDate: null });
    expect(migrated.daily).toEqual({ lastCompletedDate: '2026-11-01', history: {} });
    expect(migrated).not.toHaveProperty('streakDays');
    expect(migrated).not.toHaveProperty('dailyChallengeDate');
    expect(migrated).not.toHaveProperty('dailyChallengeDone');
  });

  it('back-fills stats from v1 data', () => {
    expect(migrated.stats.quizzesTaken).toBe(4);
    expect(migrated.stats.quantaEarned).toBe(30);
    expect(migrated.stats.questionsAnswered).toBe(0);
  });

  it('adds empty containers for new features', () => {
    expect(migrated.bosses).toEqual({});
    expect(migrated.achievements).toEqual({});
    expect(migrated.challenge).toEqual({ runs: 0, best: {} });
  });

  it('is idempotent', () => {
    expect(migrateProgress(migrated)).toEqual(migrated);
  });
});

describe('salvageProgress (lenient, for persisted data)', () => {
  it('returns defaults for non-objects', () => {
    expect(salvageProgress(undefined)).toEqual(defaultProgress());
    expect(salvageProgress('garbage')).toEqual(defaultProgress());
    expect(salvageProgress([1, 2])).toEqual(defaultProgress());
  });

  it('repairs field by field instead of discarding everything', () => {
    const p = salvageProgress({
      ...V1_SAVE,
      currency: -50, // invalid → default 0
      theme: 'neon', // invalid → default
      settings: { audio: false, textSize: 'xl' }, // one bad sub-field → only it is reset
      missions: {
        ...V1_SAVE.missions,
        broken: { completed: 'yes' }, // invalid entry is dropped, others kept
      },
    });
    expect(p.playerName).toBe('Ada');
    expect(p.currency).toBe(0);
    expect(p.theme).toBe('dark');
    expect(p.settings).toEqual({ audio: false, textSize: 'md', reducedMotion: false, kidTone: false, challengeTiming: 'standard' });
    expect(Object.keys(p.missions).sort()).toEqual(['b-gravity', 'b-speed']);
  });

  it('enforces invariants', () => {
    const p = salvageProgress({
      unlockedWorlds: ['advanced', 'advanced'],
      collection: { badges: ['x', 'x', 'y'] },
      missions: { a: { missionId: 'WRONG', completed: true, stars: 1, bestScore: 1, attempts: 1, lastPlayed: 0 } },
      streak: { current: 9, longest: 2, lastActiveDate: null },
    });
    expect(p.unlockedWorlds).toEqual(['beginner', 'advanced']);
    expect(p.collection.badges).toEqual(['x', 'y']);
    expect(p.missions['a']?.missionId).toBe('a');
    expect(p.streak.longest).toBe(9);
  });
});

describe('parseProgressStrict (import)', () => {
  it('accepts a v1 export and upgrades it', () => {
    const r = parseProgressStrict(V1_SAVE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.progress).toEqual(migrateProgress(V1_SAVE));
  });

  it('rejects non-save files with a readable reason', () => {
    expect(parseProgressStrict(null)).toMatchObject({ ok: false });
    expect(parseProgressStrict([1])).toMatchObject({ ok: false });
    expect(parseProgressStrict({ hello: 'world' })).toEqual({
      ok: false,
      error: 'This does not look like a Physics Companion save file.',
    });
  });

  it('rejects wrong types instead of silently loading them', () => {
    const r = parseProgressStrict({ ...V1_SAVE, currency: 'lots' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('currency');
  });
});
