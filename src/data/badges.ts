// Display information for every badge id that can appear in `progress.collection.badges`.
import type { AchievementTier, Difficulty } from '../types';
import { ALL_MISSIONS } from './missions';
import { BOSSES } from './bosses';
import { ACHIEVEMENTS, ACHIEVEMENT_BADGE_PREFIX } from './achievements';

export type BadgeSource = 'achievement' | 'boss' | 'mission';

export interface BadgeInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  source: BadgeSource;
  tier?: AchievementTier;
  secret?: boolean;
}

const WORLD_ICON: Record<Difficulty, string> = { beginner: '🌱', intermediate: '⚡', advanced: '🚀', expert: '🧠' };

export const ALL_BADGES: BadgeInfo[] = [
  ...ACHIEVEMENTS.map<BadgeInfo>((a) => ({
    id: `${ACHIEVEMENT_BADGE_PREFIX}${a.id}`,
    name: a.title,
    icon: a.icon,
    description: a.description,
    source: 'achievement',
    tier: a.tier,
    ...(a.secret ? { secret: true } : {}),
  })),
  ...BOSSES.map<BadgeInfo>((b) => ({
    id: b.rewards.badge,
    name: b.name,
    icon: b.emoji,
    description: `Defeated ${b.name}.`,
    source: 'boss',
  })),
  ...ALL_MISSIONS.map<BadgeInfo>((m) => ({
    id: `badge-${m.id}`,
    name: m.title,
    icon: WORLD_ICON[m.world],
    description: `Completed the ${m.title} mission.`,
    source: 'mission',
  })),
];

const BY_ID = new Map(ALL_BADGES.map((b) => [b.id, b]));

export function describeBadge(id: string): BadgeInfo | undefined {
  return BY_ID.get(id);
}
