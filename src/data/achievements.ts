// Milestone achievements. Each one is pure data + a progress function over `Progress`, so the
// same definition drives unlocking (engine), progress bars (UI) and retroactive awards (old saves).
// Later phases add streak/daily ("dedication") and challenge-mode achievements here.
import type { AchievementDef, Difficulty, Progress } from '../types';
import { ALL_MISSIONS, missionsByWorld } from './missions';
import { BOSSES, bossForWorld } from './bosses';
import { LAWS } from './laws';
import { CONSTANTS } from './constants';

const completedMissions = (p: Progress) => ALL_MISSIONS.filter((m) => p.missions[m.id]?.completed).length;
const threeStarMissions = (p: Progress) => ALL_MISSIONS.filter((m) => p.missions[m.id]?.stars === 3).length;
const threeStarInWorld = (p: Progress, w: Difficulty) => missionsByWorld(w).filter((m) => p.missions[m.id]?.stars === 3).length;
const codexEntries = (p: Progress) =>
  LAWS.filter((l) => p.collection.laws.includes(l.id)).length + CONSTANTS.filter((c) => p.collection.constants.includes(c.id)).length;
const bossesDefeated = (p: Progress) => BOSSES.filter((b) => p.bosses[b.id]?.defeated).length;
const bossDefeated = (p: Progress, w: Difficulty) => {
  const boss = bossForWorld(w);
  return boss && p.bosses[boss.id]?.defeated ? 1 : 0;
};
const count = (current: number, target: number) => ({ current, target });

const WORLD_NAMES: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

const worldMastery = (world: Difficulty, icon: string): AchievementDef => ({
  id: `master-${world}`,
  title: `${WORLD_NAMES[world]} Master`,
  description: `Earn 3★ on every mission in the ${WORLD_NAMES[world]} world.`,
  icon,
  category: 'mastery',
  tier: 'gold',
  quanta: 50,
  progress: (p) => count(threeStarInWorld(p, world), missionsByWorld(world).length),
});

const bossAchievement = (world: Difficulty, id: string, title: string, icon: string): AchievementDef => {
  const boss = bossForWorld(world);
  return {
    id,
    title,
    description: `Defeat ${boss?.name ?? 'the world boss'}.`,
    icon,
    category: 'bosses',
    tier: 'silver',
    quanta: 25,
    progress: (p) => count(bossDefeated(p, world), 1),
  };
};

function streakAchievement(
  days: number,
  id: string,
  title: string,
  icon: string,
  tier: AchievementDef['tier'],
  quanta: number,
): AchievementDef {
  return {
    id,
    title,
    description: `Reach a ${days}-day streak.`,
    icon,
    category: 'dedication',
    tier,
    quanta,
    progress: (p) => count(Math.max(p.streak.longest, p.streak.current), days),
  };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---------------------------------------------------------------- missions
  { id: 'first-steps', title: 'First Steps', description: 'Complete your first mission.', icon: '👣', category: 'missions', tier: 'bronze', quanta: 10, progress: (p) => count(completedMissions(p), 1) },
  { id: 'explorer', title: 'Explorer', description: 'Complete 10 missions.', icon: '🧭', category: 'missions', tier: 'silver', quanta: 25, progress: (p) => count(completedMissions(p), 10) },
  { id: 'adventurer', title: 'Adventurer', description: 'Complete 20 missions.', icon: '🗺️', category: 'missions', tier: 'gold', quanta: 50, progress: (p) => count(completedMissions(p), 20) },
  { id: 'completionist', title: 'Completionist', description: `Complete all ${ALL_MISSIONS.length} missions.`, icon: '🌌', category: 'missions', tier: 'platinum', quanta: 100, progress: (p) => count(completedMissions(p), ALL_MISSIONS.length) },

  // ----------------------------------------------------------------- mastery
  { id: 'first-perfect', title: 'Flawless Logic', description: 'Finish a quiz with every answer right without paying for hints.', icon: '💯', category: 'mastery', tier: 'bronze', quanta: 10, progress: (p) => count(p.stats.perfectQuizzes, 1) },
  { id: 'perfectionist', title: 'Perfectionist', description: 'Finish 25 perfect quizzes.', icon: '🎯', category: 'mastery', tier: 'gold', quanta: 50, progress: (p) => count(p.stats.perfectQuizzes, 25) },
  { id: 'star-collector', title: 'Star Collector', description: 'Earn 3★ on 10 missions.', icon: '⭐', category: 'mastery', tier: 'silver', quanta: 25, progress: (p) => count(threeStarMissions(p), 10) },
  worldMastery('beginner', '🌱'),
  worldMastery('intermediate', '⚡'),
  worldMastery('advanced', '🚀'),
  worldMastery('expert', '🧠'),
  { id: 'independent-thinker', title: 'Independent Thinker', description: 'Pass 10 mission quizzes without using a single hint.', icon: '🦉', category: 'mastery', tier: 'silver', quanta: 25, progress: (p) => count(p.stats.hintFreeQuizzes, 10) },

  // --------------------------------------------------------------- knowledge
  { id: 'curious-mind', title: 'Curious Mind', description: 'Answer 50 questions correctly.', icon: '🔍', category: 'knowledge', tier: 'bronze', quanta: 10, progress: (p) => count(p.stats.questionsCorrect, 50) },
  { id: 'scholar', title: 'Scholar', description: 'Answer 250 questions correctly.', icon: '📚', category: 'knowledge', tier: 'silver', quanta: 30, progress: (p) => count(p.stats.questionsCorrect, 250) },
  { id: 'sage', title: 'Sage', description: 'Answer 1,000 questions correctly.', icon: '🧙', category: 'knowledge', tier: 'gold', quanta: 75, progress: (p) => count(p.stats.questionsCorrect, 1000) },
  { id: 'on-a-roll', title: 'On a Roll', description: 'Answer 5 questions in a row correctly.', icon: '🎳', category: 'knowledge', tier: 'bronze', quanta: 10, progress: (p) => count(p.stats.bestAnswerStreak, 5) },
  { id: 'unstoppable', title: 'Unstoppable', description: 'Answer 9 questions in a row correctly.', icon: '🔥', category: 'knowledge', tier: 'silver', quanta: 25, progress: (p) => count(p.stats.bestAnswerStreak, 9) },
  { id: 'codex-collector', title: 'Codex Collector', description: 'Discover 25 Codex entries (laws and constants).', icon: '📖', category: 'knowledge', tier: 'silver', quanta: 30, progress: (p) => count(codexEntries(p), 25) },
  { id: 'codex-complete', title: 'Living Encyclopedia', description: 'Discover every law and constant in the Codex.', icon: '🏛️', category: 'knowledge', tier: 'platinum', quanta: 100, progress: (p) => count(codexEntries(p), LAWS.length + CONSTANTS.length) },
  { id: 'quanta-hoarder', title: 'Quantum Treasury', description: 'Earn 1,000 Quanta in total.', icon: '💎', category: 'knowledge', tier: 'silver', quanta: 25, progress: (p) => count(p.stats.quantaEarned, 1000) },

  // ------------------------------------------------------------------ bosses
  bossAchievement('beginner', 'golem-breaker', 'Golem Breaker', '🗿'),
  bossAchievement('intermediate', 'hydra-slayer', 'Hydra Slayer', '🐉'),
  bossAchievement('advanced', 'leviathan-tamer', 'Leviathan Tamer', '🐋'),
  bossAchievement('expert', 'sphinx-solver', 'Riddle of the Sphinx', '🔮'),
  { id: 'world-conqueror', title: 'World Conqueror', description: 'Defeat all four world bosses.', icon: '👑', category: 'bosses', tier: 'platinum', quanta: 150, progress: (p) => count(bossesDefeated(p), BOSSES.length) },
  { id: 'flawless-victory', title: 'Flawless Victory', description: 'Defeat a boss without losing a single heart.', icon: '🛡️', category: 'bosses', tier: 'gold', quanta: 50, progress: (p) => count(BOSSES.some((b) => p.bosses[b.id]?.bestHeartsLeft === 3) ? 1 : 0, 1) },
  { id: 'purist', title: 'Purist', description: 'Defeat a boss without using any hints.', icon: '🧘', category: 'bosses', tier: 'gold', quanta: 50, progress: (p) => count(p.stats.bossWinsWithoutHints, 1) },
  { id: 'clutch', title: 'Clutch', description: 'Defeat a boss with only one heart left.', icon: '😅', category: 'bosses', tier: 'silver', secret: true, quanta: 25, progress: (p) => count(p.stats.clutchBossWins, 1) },
  // -------------------------------------------------------------- dedication
  streakAchievement(3, 'warming-up', 'Warming Up', '🕯️', 'bronze', 15),
  streakAchievement(7, 'week-warrior', 'Week Warrior', '🔥', 'silver', 30),
  streakAchievement(14, 'fortnight-focus', 'Fortnight Focus', '☄️', 'silver', 50),
  streakAchievement(30, 'monthly-master', 'Monthly Master', '🌙', 'gold', 100),
  streakAchievement(100, 'centurion', 'Centurion', '☀️', 'platinum', 250),
  { id: 'daily-dose', title: 'Daily Dose', description: 'Complete your first daily challenge.', icon: '📅', category: 'dedication', tier: 'bronze', quanta: 10, progress: (p) => count(p.stats.dailyChallengesCompleted, 1) },
  { id: 'regular', title: 'Regular', description: 'Complete 7 daily challenges.', icon: '🗓️', category: 'dedication', tier: 'silver', quanta: 30, progress: (p) => count(p.stats.dailyChallengesCompleted, 7) },
  { id: 'devoted', title: 'Devoted', description: 'Complete 30 daily challenges.', icon: '🏅', category: 'dedication', tier: 'gold', quanta: 75, progress: (p) => count(p.stats.dailyChallengesCompleted, 30) },
  { id: 'sharp-mind', title: 'Sharp Mind', description: 'Finish a daily challenge perfectly.', icon: '✨', category: 'dedication', tier: 'silver', quanta: 25, progress: (p) => count(p.stats.perfectDailies, 1) },

  // --------------------------------------------------------------- challenge
  { id: 'challenger', title: 'Challenger', description: 'Finish your first challenge-mode run.', icon: '⏱️', category: 'challenge', tier: 'bronze', quanta: 10, progress: (p) => count(p.challenge.runs, 1) },
  { id: 'lightning-mind', title: 'Lightning Mind', description: 'Score 150 points in a timed Blitz run.', icon: '⚡', category: 'challenge', tier: 'silver', quanta: 30, progress: (p) => count(Math.max(p.challenge.best['blitz:standard']?.score ?? 0, p.challenge.best['blitz:relaxed']?.score ?? 0), 150) },
  { id: 'perfect-sprint', title: 'Perfect Sprint', description: 'Answer all 10 Sprint questions correctly.', icon: '🏃', category: 'challenge', tier: 'gold', quanta: 50, progress: (p) => count(p.stats.perfectSprints, 1) },
  { id: 'survivor', title: 'Survivor', description: 'Answer 20 questions correctly in one Survival run.', icon: '🧗', category: 'challenge', tier: 'gold', quanta: 50, progress: (p) => count(p.stats.longestSurvival, 20) },
  { id: 'combo-master', title: 'Combo Master', description: 'Reach a 10-answer combo in challenge mode.', icon: '🎰', category: 'challenge', tier: 'silver', quanta: 30, progress: (p) => count(p.stats.bestChallengeCombo, 10) },

  { id: 'never-give-up', title: 'Never Give Up', description: 'Challenge the same boss 5 times.', icon: '💪', category: 'bosses', tier: 'bronze', secret: true, quanta: 15, progress: (p) => count(Math.max(0, ...BOSSES.map((b) => p.bosses[b.id]?.attempts ?? 0)), 5) },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievement(id: string): AchievementDef | undefined {
  return BY_ID.get(id);
}

export const ACHIEVEMENT_BADGE_PREFIX = 'ach-';
