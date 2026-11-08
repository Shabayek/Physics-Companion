// The single entry point through which gameplay changes progress.
//
// UI code dispatches a GameEvent; `applyEvent` is a pure reducer returning the new
// progress, notices for the player (toasts) and a typed outcome for the screen that
// dispatched it. Stats, rewards, unlocks — and in later phases streaks, achievements
// and boss/daily/challenge records — are all updated here, in one place.
import type { AnswerRecord, Boss, Difficulty, Mission, Progress, ScoreResult } from '../../types';
import { getMission } from '../../data/missions';
import { bossForWorld, getBoss } from '../../data/bosses';
import { collectionAdd, recordMission, unlockNextWorld } from './progress';
import { longestRun, scoreAnswers } from './scoring';
import { bossQuantaReward, missionQuantaReward } from './rewards';
import { bossStars, bossUnlockStatus, isBossUnlocked, replayBossBattle, BOSS_MAX_HP } from './boss';
import { evaluateAchievements } from './achievements';
import { recordActivity, type StreakChange } from './streak';
import { buildDailyChallenge, dailyReward, DAILY_HISTORY_LIMIT, type DailyReward } from './daily';
import { daysBetween, isDateKey, toLocalDateKey } from '../../lib/time';
import {
  challengeBestKey,
  challengeQuanta,
  replayChallenge,
  type ChallengeAnswer,
  type ChallengeEndReason,
  type ChallengeInput,
  type ChallengeMode,
  type ChallengeTiming,
} from './challenge';
import { buildMissionQuiz } from './questions';
import { isAnswerCorrect } from './quiz';
import { MAX_HINTS } from './hints';

export type GameEvent =
  | {
      type: 'MISSION_QUIZ_SUBMITTED';
      missionId: string;
      /** Seed the quiz was built with (`buildMissionQuiz(mission, seed)`). */
      seed: string;
      /** One record per question, in quiz order. */
      answers: AnswerRecord[];
    }
  | {
      type: 'BOSS_BATTLE_FINISHED';
      bossId: string;
      /** Seed the battle's question pools were built with. */
      seed: string;
      /** Every answered question, in order. A log that ends mid-battle counts as a retreat. */
      answers: AnswerRecord[];
    }
  | {
      type: 'CHALLENGE_FINISHED';
      mode: ChallengeMode;
      timing: ChallengeTiming;
      /** Highest world included (the run uses every world up to it). */
      tier: Difficulty;
      seed: string;
      answers: ChallengeInput[];
      /** Why the UI stopped, if the answers alone do not end the run. */
      endReason: 'time' | 'quit';
    }
  | {
      type: 'DAILY_CHALLENGE_SUBMITTED';
      /** Local date of the challenge (`YYYY-MM-DD`); today, or yesterday if finished after midnight. */
      date: string;
      tier: Difficulty;
      answers: AnswerRecord[];
    };

export type NoticeKind = 'reward' | 'unlock' | 'achievement' | 'streak' | 'info' | 'error';

export interface GameNotice {
  kind: NoticeKind;
  title: string;
  message?: string;
}

export interface MissionOutcome {
  kind: 'mission';
  missionId: string;
  score: ScoreResult;
  correct: number;
  total: number;
  hintsUsed: number;
  /** Re-graded answers (the engine's verdict). */
  answers: AnswerRecord[];
  firstClear: boolean;
  newBest: boolean;
  quanta: number;
  badges: string[];
  /** Set when this mission made the world's boss appear. */
  bossUnlocked: string | null;
}

export interface BossOutcome {
  kind: 'boss';
  bossId: string;
  won: boolean;
  retreated: boolean;
  heartsLeft: number;
  stars: 0 | 1 | 2 | 3;
  damageDealt: number;
  timeMs: number;
  firstDefeat: boolean;
  newBestTime: boolean;
  quanta: number;
  lawsAdded: string[];
  constantsAdded: string[];
  unlockedWorld: Difficulty | null;
  answers: AnswerRecord[];
}

export interface DailyOutcome {
  kind: 'daily';
  date: string;
  tier: Difficulty;
  /** Already completed for that date: no rewards, nothing recorded. */
  practice: boolean;
  score: ScoreResult;
  correct: number;
  total: number;
  reward: DailyReward;
  answers: AnswerRecord[];
}

export interface ChallengeOutcome {
  kind: 'challenge';
  mode: ChallengeMode;
  timing: ChallengeTiming;
  score: number;
  correct: number;
  answered: number;
  bestCombo: number;
  endReason: ChallengeEndReason;
  /** Previous personal best for this mode and timing (null if first run). */
  previousBest: number | null;
  newBest: boolean;
  quanta: number;
  answers: ChallengeAnswer[];
}

export interface IgnoredOutcome {
  kind: 'ignored';
  reason: string;
}

export type EventOutcome = MissionOutcome | BossOutcome | DailyOutcome | ChallengeOutcome | IgnoredOutcome;

export interface EventResult {
  progress: Progress;
  notices: GameNotice[];
  outcome: EventOutcome;
  /** Ids of achievements unlocked by this event. */
  achievements: string[];
  /** How the event affected the daily streak. */
  streak: StreakChange | null;
}

export interface EventContext {
  now: number;
  /** Local calendar date of `now` (`YYYY-MM-DD`); derived from `now` if omitted. */
  today?: string;
  /** Content lookup; defaults to the bundled mission data. Overridable in tests. */
  getMission?: (id: string) => Mission | undefined;
}

export function applyEvent(progress: Progress, event: GameEvent, ctx: EventContext): EventResult {
  const today = ctx.today ?? toLocalDateKey(ctx.now);
  const result = applyEventCore(progress, event, { ...ctx, today });
  if (result.outcome.kind === 'ignored') return { ...result, achievements: [], streak: null };

  // Streak: any finished activity with at least one correct answer counts for today.
  let next = result.progress;
  const notices = [...result.notices];
  let streak: StreakChange | null = null;
  if (result.activity) {
    const r = recordActivity(next.streak, today);
    streak = r.change;
    next = { ...next, streak: r.streak };
    const notice = streakNotice(r.change, r.streak.current);
    if (notice) notices.push(notice);
  }

  // Milestones are checked after every real event, in one place.
  const evaluated = evaluateAchievements(next, ctx.now);
  return {
    progress: evaluated.progress,
    notices: [...notices, ...achievementNotices(evaluated.unlocked)],
    outcome: result.outcome,
    achievements: evaluated.unlocked.map((a) => a.id),
    streak,
  };
}

function streakNotice(change: StreakChange, days: number): GameNotice | null {
  if (change === 'extended') return { kind: 'streak', title: `${days}-day streak!`, message: 'Come back tomorrow to keep it going.' };
  if (change === 'started') return { kind: 'streak', title: 'Streak started!', message: 'Play again tomorrow to build your streak.' };
  if (change === 'reset') return { kind: 'streak', title: 'New streak started', message: 'Your previous streak ended — day 1 again!' };
  return null;
}

/** Above this many simultaneous unlocks, achievements are summarised in one notice (keeps toasts readable). */
export const MAX_ACHIEVEMENT_NOTICES = 2;

export function achievementNotices(unlocked: readonly { title: string; quanta: number }[]): GameNotice[] {
  if (unlocked.length <= MAX_ACHIEVEMENT_NOTICES) return unlocked.map(achievementNotice);
  const quanta = unlocked.reduce((sum, a) => sum + a.quanta, 0);
  return [
    {
      kind: 'achievement',
      title: `${unlocked.length} achievements unlocked!`,
      message: `${unlocked.map((a) => a.title).join(', ')}${quanta > 0 ? ` · +${quanta} Quanta` : ''}`,
    },
  ];
}

export function achievementNotice(def: { title: string; quanta: number }): GameNotice {
  return { kind: 'achievement', title: `Achievement unlocked: ${def.title}`, ...(def.quanta > 0 ? { message: `+${def.quanta} Quanta` } : {}) };
}

/** What the per-event handlers return; streak and achievements are handled by `applyEvent`. */
interface CoreResult {
  progress: Progress;
  notices: GameNotice[];
  outcome: EventOutcome;
  /** The event counts as activity for the daily streak. */
  activity: boolean;
}

function applyEventCore(progress: Progress, event: GameEvent, ctx: EventContext & { today: string }): CoreResult {
  switch (event.type) {
    case 'MISSION_QUIZ_SUBMITTED':
      return applyMissionQuiz(progress, event, ctx);
    case 'BOSS_BATTLE_FINISHED':
      return applyBossBattle(progress, event, ctx);
    case 'DAILY_CHALLENGE_SUBMITTED':
      return applyDailyChallenge(progress, event, ctx);
    case 'CHALLENGE_FINISHED':
      return applyChallengeRun(progress, event, ctx);
    default: {
      const unknownType: never = event;
      return ignored(progress, `Unknown event ${String(unknownType)}`);
    }
  }
}

function ignored(progress: Progress, reason: string): CoreResult {
  return { progress, notices: [], outcome: { kind: 'ignored', reason }, activity: false };
}

function applyMissionQuiz(
  progress: Progress,
  event: Extract<GameEvent, { type: 'MISSION_QUIZ_SUBMITTED' }>,
  ctx: EventContext,
): CoreResult {
  const lookup = ctx.getMission ?? getMission;
  const mission = lookup(event.missionId);
  if (!mission) return ignored(progress, `Unknown mission ${event.missionId}`);

  // Re-grade against the quiz rebuilt from the seed: the engine, not the UI, decides what is correct.
  const quiz = buildMissionQuiz(mission, event.seed);
  if (quiz.length === 0 || event.answers.length !== quiz.length) return ignored(progress, 'Answers do not match the quiz');
  const answers: AnswerRecord[] = [];
  for (const [i, q] of quiz.entries()) {
    const a = event.answers[i] as AnswerRecord;
    if (a.questionId !== q.id) return ignored(progress, 'Answers do not match the quiz');
    answers.push({
      ...a,
      correct: isAnswerCorrect(q, a.answer),
      hintsUsed: clampInt(a.hintsUsed, 0, Math.min(MAX_HINTS, q.hints?.length ?? 0)),
      freeHints: clampInt(a.freeHints, 0, MAX_HINTS),
      timeMs: Math.max(0, Number.isFinite(a.timeMs) ? a.timeMs : 0),
    });
  }
  const total = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  const hintsUsed = answers.reduce((sum, a) => sum + a.hintsUsed, 0);
  const score = scoreAnswers(answers);

  const before = progress.missions[mission.id];
  const bossBefore = bossUnlockStatus(progress, mission.world).unlocked;
  const wasCompleted = before?.completed ?? false;
  const firstClear = !wasCompleted && score.stars >= 1;
  const newBest = before === undefined ? score.points > 0 : score.points > before.bestScore;

  let next = recordMission(progress, mission.id, score.stars, score.points, ctx.now);
  const notices: GameNotice[] = [];

  // Rewards
  const quanta = missionQuantaReward(mission, score.stars, firstClear);
  const badges: string[] = [];
  if (firstClear) {
    for (const r of mission.rewards) {
      if (r.type === 'constant') next = collectionAdd(next, 'constants', r.id);
      if (r.type === 'law') next = collectionAdd(next, 'laws', r.id);
      if (r.type === 'avatar') next = collectionAdd(next, 'avatarItems', r.id);
      if (r.type === 'badge' && !next.collection.badges.includes(r.id)) {
        next = collectionAdd(next, 'badges', r.id);
        badges.push(r.id);
      }
    }
  }
  if (quanta > 0) next = { ...next, currency: next.currency + quanta };

  // Stats
  next = {
    ...next,
    stats: {
      ...next.stats,
      quizzesTaken: next.stats.quizzesTaken + 1,
      questionsAnswered: next.stats.questionsAnswered + total,
      questionsCorrect: next.stats.questionsCorrect + correct,
      perfectQuizzes: next.stats.perfectQuizzes + (score.bonuses.includes('perfect') ? 1 : 0),
      hintFreeQuizzes: next.stats.hintFreeQuizzes + (hintsUsed === 0 && score.stars >= 1 ? 1 : 0),
      bestAnswerStreak: Math.max(next.stats.bestAnswerStreak, score.streak),
      hintsUsed: next.stats.hintsUsed + hintsUsed,
      quantaEarned: next.stats.quantaEarned + quanta,
    },
  };

  // The world's boss appears once enough missions are completed (worlds unlock by beating bosses).
  const boss = bossForWorld(mission.world);
  const bossUnlocked = boss && !bossBefore && bossUnlockStatus(next, mission.world).unlocked ? boss.id : null;

  // Notices
  if (firstClear) {
    notices.push({ kind: 'reward', title: `Mission complete: ${mission.title}`, message: `+${quanta} Quanta` });
  } else if (quanta > 0) {
    notices.push({ kind: 'reward', title: 'Replay reward', message: `+${quanta} Quanta` });
  }
  if (badges.length > 0) notices.push({ kind: 'reward', title: 'Badge earned', message: mission.title });
  if (boss && bossUnlocked) {
    notices.push({ kind: 'unlock', title: 'A boss has appeared!', message: `${boss.name} awaits in the ${capitalize(boss.world)} world.` });
  }

  return {
    progress: next,
    notices,
    activity: correct > 0,
    outcome: {
      kind: 'mission',
      missionId: mission.id,
      score,
      correct,
      total,
      hintsUsed,
      answers,
      firstClear,
      newBest,
      quanta,
      badges,
      bossUnlocked,
    },
  };
}

function applyBossBattle(
  progress: Progress,
  event: Extract<GameEvent, { type: 'BOSS_BATTLE_FINISHED' }>,
  ctx: EventContext,
): CoreResult {
  const ignore = (reason: string): CoreResult => ignored(progress, reason);
  const boss: Boss | undefined = getBoss(event.bossId);
  if (!boss) return ignore(`Unknown boss ${event.bossId}`);
  if (!isBossUnlocked(progress, boss)) return ignore(`${boss.name} is still locked`);

  const answers = event.answers.map((a) => ({
    ...a,
    hintsUsed: clampInt(a.hintsUsed, 0, 3),
    freeHints: clampInt(a.freeHints, 0, 3),
    timeMs: Math.max(0, Number.isFinite(a.timeMs) ? a.timeMs : 0),
  }));
  const replay = replayBossBattle(boss, event.seed, answers);
  if (!replay.valid) return ignore(replay.reason);
  const { battle, retreated } = replay;

  const won = battle.status === 'won';
  const before = progress.bosses[boss.id];
  const firstDefeat = won && !before?.defeated;
  const timeMs = battle.answers.reduce((sum, a) => sum + a.timeMs, 0);
  const newBestTime = won && (before?.bestTimeMs == null || timeMs < before.bestTimeMs);
  const correct = battle.answers.filter((a) => a.correct).length;
  const hintsUsed = battle.answers.reduce((sum, a) => sum + a.hintsUsed, 0);

  let next: Progress = {
    ...progress,
    bosses: {
      ...progress.bosses,
      [boss.id]: {
        defeated: won || (before?.defeated ?? false),
        attempts: (before?.attempts ?? 0) + 1,
        bestTimeMs: newBestTime ? timeMs : (before?.bestTimeMs ?? null),
        bestHeartsLeft: Math.max(before?.bestHeartsLeft ?? 0, won ? battle.hearts : 0),
        defeatedAt: before?.defeatedAt ?? (won ? ctx.now : null),
      },
    },
  };

  // Rewards
  const quanta = bossQuantaReward(boss, won, firstDefeat);
  const lawsAdded: string[] = [];
  const constantsAdded: string[] = [];
  if (firstDefeat) {
    for (const id of boss.rewards.laws) {
      if (!next.collection.laws.includes(id)) lawsAdded.push(id);
      next = collectionAdd(next, 'laws', id);
    }
    for (const id of boss.rewards.constants) {
      if (!next.collection.constants.includes(id)) constantsAdded.push(id);
      next = collectionAdd(next, 'constants', id);
    }
    next = collectionAdd(next, 'badges', boss.rewards.badge);
  }
  if (quanta > 0) next = { ...next, currency: next.currency + quanta };

  next = {
    ...next,
    stats: {
      ...next.stats,
      questionsAnswered: next.stats.questionsAnswered + battle.answers.length,
      questionsCorrect: next.stats.questionsCorrect + correct,
      bestAnswerStreak: Math.max(next.stats.bestAnswerStreak, longestRun(battle.answers.map((a) => a.correct))),
      hintsUsed: next.stats.hintsUsed + hintsUsed,
      quantaEarned: next.stats.quantaEarned + quanta,
      bossWinsWithoutHints: next.stats.bossWinsWithoutHints + (won && hintsUsed === 0 ? 1 : 0),
      clutchBossWins: next.stats.clutchBossWins + (won && battle.hearts === 1 ? 1 : 0),
    },
  };

  // Beating the boss opens the next world.
  let unlockedWorld: Difficulty | null = null;
  if (won) {
    const unlocked = unlockNextWorld(next, boss.world);
    if (unlocked !== next) {
      unlockedWorld = unlocked.unlockedWorlds[unlocked.unlockedWorlds.length - 1] ?? null;
      next = unlocked;
    }
  }

  const notices: GameNotice[] = [];
  if (won) {
    notices.push({
      kind: 'reward',
      title: firstDefeat ? `${boss.name} defeated!` : `${boss.name} defeated again!`,
      message: `+${quanta} Quanta`,
    });
    // Most important first: only a couple of toasts are visible at a time.
    if (unlockedWorld) {
      notices.push({ kind: 'unlock', title: 'New world unlocked!', message: `The ${capitalize(unlockedWorld)} world is open.` });
    }
    if (lawsAdded.length + constantsAdded.length > 0) {
      notices.push({
        kind: 'reward',
        title: 'Codex updated',
        message: `${lawsAdded.length} laws and ${constantsAdded.length} constants added`,
      });
    }
  }

  return {
    progress: next,
    notices,
    activity: correct > 0,
    outcome: {
      kind: 'boss',
      bossId: boss.id,
      won,
      retreated,
      heartsLeft: battle.hearts,
      stars: bossStars(battle),
      damageDealt: BOSS_MAX_HP - battle.hp,
      timeMs,
      firstDefeat,
      newBestTime,
      quanta,
      lawsAdded,
      constantsAdded,
      unlockedWorld,
      answers: battle.answers,
    },
  };
}

function applyDailyChallenge(
  progress: Progress,
  event: Extract<GameEvent, { type: 'DAILY_CHALLENGE_SUBMITTED' }>,
  ctx: EventContext & { today: string },
): CoreResult {
  const { date, tier } = event;
  if (!isDateKey(date)) return ignored(progress, 'Invalid date');
  const age = daysBetween(date, ctx.today);
  if (age < 0 || age > 1) return ignored(progress, 'This daily challenge is not available any more');
  if (!progress.unlockedWorlds.includes(tier)) return ignored(progress, `The ${tier} tier is locked`);

  const questions = buildDailyChallenge(date, tier);
  if (event.answers.length !== questions.length) return ignored(progress, 'Answers do not match the challenge');
  const answers: AnswerRecord[] = [];
  for (const [i, q] of questions.entries()) {
    const a = event.answers[i] as AnswerRecord;
    if (a.questionId !== q.id) return ignored(progress, 'Answers do not match the challenge');
    answers.push({
      ...a,
      correct: isAnswerCorrect(q, a.answer),
      hintsUsed: clampInt(a.hintsUsed, 0, Math.min(MAX_HINTS, q.hints?.length ?? 0)),
      freeHints: clampInt(a.freeHints, 0, MAX_HINTS),
      timeMs: Math.max(0, Number.isFinite(a.timeMs) ? a.timeMs : 0),
    });
  }
  const correct = answers.filter((a) => a.correct).length;
  const score = scoreAnswers(answers);
  const practice = !!progress.daily.history[date];
  const hintsUsed = answers.reduce((sum, a) => sum + a.hintsUsed, 0);

  // The streak bonus uses the streak *including* today's activity (previewed here, applied by applyEvent).
  const streakDays = correct > 0 ? recordActivity(progress.streak, ctx.today).streak.current : progress.streak.current;
  const reward = practice ? dailyReward(tier, [], 0) : dailyReward(tier, answers, streakDays);
  const perfect = score.bonuses.includes('perfect');

  let next: Progress = {
    ...progress,
    currency: progress.currency + reward.total,
    stats: {
      ...progress.stats,
      questionsAnswered: progress.stats.questionsAnswered + answers.length,
      questionsCorrect: progress.stats.questionsCorrect + correct,
      bestAnswerStreak: Math.max(progress.stats.bestAnswerStreak, score.streak),
      hintsUsed: progress.stats.hintsUsed + hintsUsed,
      quantaEarned: progress.stats.quantaEarned + reward.total,
      dailyChallengesCompleted: progress.stats.dailyChallengesCompleted + (practice ? 0 : 1),
      perfectDailies: progress.stats.perfectDailies + (!practice && perfect ? 1 : 0),
    },
  };
  if (!practice) {
    const history = { ...progress.daily.history, [date]: { score: score.points, correct, total: answers.length, completedAt: ctx.now, tier, stars: score.stars } };
    const kept = Object.keys(history).sort().slice(-DAILY_HISTORY_LIMIT);
    const lastCompletedDate = !progress.daily.lastCompletedDate || date > progress.daily.lastCompletedDate ? date : progress.daily.lastCompletedDate;
    next = { ...next, daily: { lastCompletedDate, history: Object.fromEntries(kept.map((k) => [k, history[k] as (typeof history)[string]])) } };
  }

  const notices: GameNotice[] = [];
  if (!practice && reward.total > 0) {
    notices.push({
      kind: 'reward',
      title: 'Daily challenge complete!',
      message: `+${reward.total} Quanta${reward.chest > 0 ? ` (including a 🎁 ${streakDays}-day streak chest)` : ''}`,
    });
  }

  return {
    progress: next,
    notices,
    activity: correct > 0,
    outcome: { kind: 'daily', date, tier, practice, score, correct, total: answers.length, reward, answers },
  };
}

function applyChallengeRun(
  progress: Progress,
  event: Extract<GameEvent, { type: 'CHALLENGE_FINISHED' }>,
  ctx: EventContext,
): CoreResult {
  if (!progress.unlockedWorlds.includes(event.tier)) return ignored(progress, `The ${event.tier} tier is locked`);
  const answers = event.answers.map((a) => ({
    ...a,
    hintsUsed: clampInt(a.hintsUsed, 0, MAX_HINTS),
    freeHints: clampInt(a.freeHints, 0, MAX_HINTS),
    timeMs: Math.max(0, Number.isFinite(a.timeMs) ? a.timeMs : 0),
  }));
  const replay = replayChallenge(event.mode, event.timing, event.tier, event.seed, answers, event.endReason);
  if (!replay.valid) return ignored(progress, replay.reason);
  const run = replay.state;

  const key = challengeBestKey(run.mode, run.timing);
  const previous = progress.challenge.best[key];
  const newBest = run.score > 0 && (!previous || run.score > previous.score);
  const quanta = challengeQuanta(run);
  const hintsUsed = run.answers.reduce((sum, a) => sum + a.hintsUsed, 0);
  const perfectSprint = run.mode === 'sprint' && run.endReason === 'complete' && run.correct === run.answers.length && run.answers.length > 0;

  const next: Progress = {
    ...progress,
    currency: progress.currency + quanta,
    challenge: {
      runs: progress.challenge.runs + 1,
      best: newBest
        ? { ...progress.challenge.best, [key]: { score: run.score, at: ctx.now, correct: run.correct, answered: run.answers.length } }
        : progress.challenge.best,
    },
    stats: {
      ...progress.stats,
      questionsAnswered: progress.stats.questionsAnswered + run.answers.length,
      questionsCorrect: progress.stats.questionsCorrect + run.correct,
      bestAnswerStreak: Math.max(progress.stats.bestAnswerStreak, run.bestCombo),
      hintsUsed: progress.stats.hintsUsed + hintsUsed,
      quantaEarned: progress.stats.quantaEarned + quanta,
      perfectSprints: progress.stats.perfectSprints + (perfectSprint ? 1 : 0),
      longestSurvival: run.mode === 'survival' ? Math.max(progress.stats.longestSurvival, run.correct) : progress.stats.longestSurvival,
      bestChallengeCombo: Math.max(progress.stats.bestChallengeCombo, run.bestCombo),
    },
  };

  const notices: GameNotice[] = [];
  if (newBest && previous) {
    notices.push({ kind: 'reward', title: `New personal best in ${capitalize(run.mode)}!`, message: `${run.score} points (was ${previous.score})` });
  }
  if (quanta > 0) notices.push({ kind: 'reward', title: 'Challenge complete', message: `+${quanta} Quanta` });

  return {
    progress: next,
    notices,
    activity: run.correct > 0,
    outcome: {
      kind: 'challenge',
      mode: run.mode,
      timing: run.timing,
      score: run.score,
      correct: run.correct,
      answered: run.answers.length,
      bestCombo: run.bestCombo,
      endReason: run.endReason ?? event.endReason,
      previousBest: previous?.score ?? null,
      newBest,
      quanta,
      answers: run.answers,
    },
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
