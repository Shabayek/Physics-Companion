// Achievement evaluation. Pure: `evaluateAchievements` unlocks every achievement whose goal is met,
// grants its Quanta and badge, and repeats (rewards can complete Quanta-based goals).
import type { AchievementDef, Progress } from '../../types';
import { ACHIEVEMENTS, ACHIEVEMENT_BADGE_PREFIX } from '../../data/achievements';
import { collectionAdd } from './progress';

export interface AchievementStatus {
  current: number;
  target: number;
  unlocked: boolean;
  unlockedAt: number | null;
  /** 0–1, for progress bars. */
  ratio: number;
}

export function achievementStatus(def: AchievementDef, progress: Progress): AchievementStatus {
  const { current, target } = def.progress(progress);
  const record = progress.achievements[def.id];
  const safeTarget = Math.max(1, target);
  const shown = record ? safeTarget : Math.min(Math.max(0, current), safeTarget);
  return {
    current: shown,
    target: safeTarget,
    unlocked: !!record,
    unlockedAt: record?.unlockedAt ?? null,
    ratio: shown / safeTarget,
  };
}

export function achievementBadgeId(def: AchievementDef): string {
  return `${ACHIEVEMENT_BADGE_PREFIX}${def.id}`;
}

const MAX_PASSES = 5;

export function evaluateAchievements(
  progress: Progress,
  now: number,
  defs: readonly AchievementDef[] = ACHIEVEMENTS,
): { progress: Progress; unlocked: AchievementDef[] } {
  let next = progress;
  const unlocked: AchievementDef[] = [];
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const newly = defs.filter((d) => !next.achievements[d.id] && (() => {
      const { current, target } = d.progress(next);
      return current >= Math.max(1, target);
    })());
    if (newly.length === 0) break;
    for (const def of newly) {
      next = {
        ...next,
        achievements: { ...next.achievements, [def.id]: { unlockedAt: now } },
        currency: next.currency + def.quanta,
        stats: { ...next.stats, quantaEarned: next.stats.quantaEarned + def.quanta },
      };
      next = collectionAdd(next, 'badges', achievementBadgeId(def));
      unlocked.push(def);
    }
  }
  return { progress: next, unlocked };
}
