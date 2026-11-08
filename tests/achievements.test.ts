import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, getAchievement } from '../src/data/achievements';
import { ALL_BADGES, describeBadge } from '../src/data/badges';
import { ALL_MISSIONS } from '../src/data/missions';
import { BOSSES } from '../src/data/bosses';
import { LAWS } from '../src/data/laws';
import { CONSTANTS } from '../src/data/constants';
import { achievementStatus, evaluateAchievements } from '../src/game/engine/achievements';
import { defaultProgress, recordMission } from '../src/game/engine/progress';
import type { Progress } from '../src/types';

const NOW = 1_800_000_000_000;

/** A save where everything that exists has been done. */
function maxedOut(): Progress {
  let p = defaultProgress();
  for (const m of ALL_MISSIONS) p = recordMission(p, m.id, 3, 100, NOW);
  return {
    ...p,
    bosses: Object.fromEntries(BOSSES.map((b) => [b.id, { defeated: true, attempts: 5, bestTimeMs: 1000, bestHeartsLeft: 3, defeatedAt: NOW }])),
    collection: { ...p.collection, laws: LAWS.map((l) => l.id), constants: CONSTANTS.map((c) => c.id) },
    stats: {
      quizzesTaken: 100, questionsAnswered: 2000, questionsCorrect: 1500, perfectQuizzes: 30, bestAnswerStreak: 20,
      hintsUsed: 0, hintFreeQuizzes: 20, bossWinsWithoutHints: 1, clutchBossWins: 1, quantaEarned: 5000,
      dailyChallengesCompleted: 40, perfectDailies: 3, perfectSprints: 1, longestSurvival: 25, bestChallengeCombo: 12,
    },
    streak: { current: 2, longest: 120, lastActiveDate: '2026-11-07' },
    challenge: { runs: 10, best: { 'blitz:standard': { score: 200, at: NOW, correct: 15, answered: 16 } } },
  };
}

describe('achievement definitions', () => {
  it('have unique ids and sane metadata', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(2);
      expect(a.description.length).toBeGreaterThan(10);
      expect(a.quanta).toBeGreaterThanOrEqual(0);
      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(a.tier);
    }
  });

  it('none is unlocked on a fresh save, and progress starts at 0', () => {
    const p = defaultProgress();
    expect(evaluateAchievements(p, NOW).unlocked).toEqual([]);
    for (const a of ACHIEVEMENTS) {
      const { current, target } = a.progress(p);
      expect(current, a.id).toBe(0);
      expect(target, a.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('every achievement is achievable: a maxed-out save unlocks all of them', () => {
    const { unlocked } = evaluateAchievements(maxedOut(), NOW);
    expect(unlocked.map((a) => a.id).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });
});

describe('evaluateAchievements', () => {
  it('unlocks met goals, grants Quanta and a badge, and is idempotent', () => {
    const p = recordMission(defaultProgress(), 'b-speed', 3, 40, NOW);
    const first = evaluateAchievements(p, NOW);
    expect(first.unlocked.map((a) => a.id)).toEqual(['first-steps']);
    expect(first.progress.achievements).toEqual({ 'first-steps': { unlockedAt: NOW } });
    expect(first.progress.currency).toBe(10);
    expect(first.progress.stats.quantaEarned).toBe(10);
    expect(first.progress.collection.badges).toEqual(['ach-first-steps']);
    const second = evaluateAchievements(first.progress, NOW + 1);
    expect(second.unlocked).toEqual([]);
    expect(second.progress).toBe(first.progress);
  });

  it('rewards can chain into Quanta milestones in the same evaluation', () => {
    let p = recordMission(defaultProgress(), 'b-speed', 3, 40, NOW);
    p = { ...p, stats: { ...p.stats, quantaEarned: 995 } };
    const { unlocked, progress } = evaluateAchievements(p, NOW);
    expect(unlocked.map((a) => a.id)).toEqual(['first-steps', 'quanta-hoarder']);
    expect(progress.stats.quantaEarned).toBe(995 + 10 + 25);
  });

  it('does not mutate its input', () => {
    const p = recordMission(defaultProgress(), 'b-speed', 3, 40, NOW);
    const snapshot = JSON.stringify(p);
    evaluateAchievements(p, NOW);
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('achievementStatus', () => {
  it('clamps progress and reports unlock time', () => {
    const explorer = getAchievement('explorer');
    if (!explorer) throw new Error('missing');
    let p = defaultProgress();
    for (const m of ALL_MISSIONS.slice(0, 4)) p = recordMission(p, m.id, 1, 10, NOW);
    expect(achievementStatus(explorer, p)).toEqual({ current: 4, target: 10, unlocked: false, unlockedAt: null, ratio: 0.4 });
    const maxed = evaluateAchievements(maxedOut(), NOW).progress;
    expect(achievementStatus(explorer, maxed)).toEqual({ current: 10, target: 10, unlocked: true, unlockedAt: NOW, ratio: 1 });
  });
});

describe('badges', () => {
  it('registry covers every achievement, boss and mission badge, with unique ids', () => {
    expect(new Set(ALL_BADGES.map((b) => b.id)).size).toBe(ALL_BADGES.length);
    expect(ALL_BADGES).toHaveLength(ACHIEVEMENTS.length + BOSSES.length + ALL_MISSIONS.length);
    expect(describeBadge('badge-b-speed')).toMatchObject({ name: 'Speed Racer', source: 'mission', icon: '🌱' });
    expect(describeBadge('badge-boss-expert')).toMatchObject({ name: 'The Quantum Sphinx', source: 'boss' });
    expect(describeBadge('ach-clutch')).toMatchObject({ name: 'Clutch', source: 'achievement', secret: true, tier: 'silver' });
  });

  it('every badge the game can grant is described', () => {
    const granted = evaluateAchievements(maxedOut(), NOW).progress.collection.badges;
    const all = [...granted, ...ALL_MISSIONS.flatMap((m) => m.rewards.filter((r) => r.type === 'badge').map((r) => r.id)), ...BOSSES.map((b) => b.rewards.badge)];
    for (const id of all) expect(describeBadge(id), id).toBeDefined();
  });
});
