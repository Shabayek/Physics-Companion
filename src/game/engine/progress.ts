import type { Difficulty, Progress } from '../../types';
import { CURRENT_PROGRESS_VERSION, salvageProgress } from './schema';

export const DIFFICULTY_ORDER: Difficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];

export function defaultProgress(playerName = 'Explorer'): Progress {
  return {
    version: CURRENT_PROGRESS_VERSION,
    playerName,
    ageMode: 'standard',
    theme: 'dark',
    locale: 'en',
    unlockedWorlds: ['beginner'],
    missions: {},
    collection: { constants: [], laws: [], badges: [], avatarItems: [] },
    currency: 0,
    settings: { audio: true, textSize: 'md', reducedMotion: false, kidTone: false, challengeTiming: 'standard' },
    stats: {
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
    },
    streak: { current: 0, longest: 0, lastActiveDate: null },
    daily: { lastCompletedDate: null, history: {} },
    bosses: {},
    achievements: {},
    challenge: { runs: 0, best: {} },
  };
}

export function isWorldUnlocked(progress: Progress, world: Difficulty): boolean {
  return progress.unlockedWorlds.includes(world);
}

export function unlockNextWorld(progress: Progress, current: Difficulty): Progress {
  const idx = DIFFICULTY_ORDER.indexOf(current);
  const next = idx >= 0 && idx < DIFFICULTY_ORDER.length - 1 ? DIFFICULTY_ORDER[idx + 1] : undefined;
  if (!next) return progress;
  if (progress.unlockedWorlds.includes(next)) return progress;
  return { ...progress, unlockedWorlds: [...progress.unlockedWorlds, next] };
}

export function missionProgress(progress: Progress, missionId: string) {
  return progress.missions[missionId];
}

export function recordMission(
  progress: Progress,
  missionId: string,
  stars: 0 | 1 | 2 | 3,
  score: number,
  now: number = Date.now(),
): Progress {
  const existing = progress.missions[missionId];
  const bestScore = existing ? Math.max(existing.bestScore, score) : score;
  const bestStars = existing ? (Math.max(existing.stars, stars) as 0 | 1 | 2 | 3) : stars;
  const completed = bestStars >= 1 || (existing?.completed ?? false);
  const updated: Progress = {
    ...progress,
    missions: {
      ...progress.missions,
      [missionId]: {
        missionId,
        completed,
        stars: bestStars,
        bestScore,
        attempts: (existing?.attempts ?? 0) + 1,
        lastPlayed: now,
      },
    },
  };
  return updated;
}

export function collectionAdd(progress: Progress, kind: 'constants' | 'laws' | 'badges' | 'avatarItems', id: string): Progress {
  const arr = progress.collection[kind];
  if (arr.includes(id)) return progress;
  return { ...progress, collection: { ...progress.collection, [kind]: [...arr, id] } };
}

/** Loads any stored/legacy progress shape into a valid current `Progress`. Never throws. */
export function migrateProgress(raw: unknown): Progress {
  return salvageProgress(raw);
}

export function worldCompletion(progress: Progress, missionIds: string[]): number {
  if (missionIds.length === 0) return 0;
  const done = missionIds.filter((id) => progress.missions[id]?.completed).length;
  return Math.round((done / missionIds.length) * 100);
}
