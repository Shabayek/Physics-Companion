import type { Boss, Mission } from '../../types';

/** Fraction of a mission's Quanta paid out when replaying an already-cleared mission. */
export const REPLAY_REWARD_RATIO = 0.2;

/** Quanta listed in the mission's rewards. */
export function missionBaseQuanta(mission: Mission): number {
  return mission.rewards.reduce((sum, r) => sum + (r.type === 'currency' && r.amount ? r.amount : 0), 0);
}

/**
 * Economy rule:
 *  - 0★ → nothing
 *  - first clear (≥1★) → full Quanta + collectibles
 *  - replay (≥1★) → REPLAY_REWARD_RATIO of the Quanta (at least 1), no collectibles
 */
export function missionQuantaReward(mission: Mission, stars: 0 | 1 | 2 | 3, firstClear: boolean): number {
  if (stars < 1) return 0;
  const base = missionBaseQuanta(mission);
  if (base <= 0) return 0;
  return firstClear ? base : Math.max(1, Math.round(base * REPLAY_REWARD_RATIO));
}

/** Boss economy: full Quanta on the first victory, REPLAY_REWARD_RATIO on later wins, nothing on a loss. */
export function bossQuantaReward(boss: Boss, won: boolean, firstDefeat: boolean): number {
  if (!won) return 0;
  return firstDefeat ? boss.rewards.quanta : Math.max(1, Math.round(boss.rewards.quanta * REPLAY_REWARD_RATIO));
}
