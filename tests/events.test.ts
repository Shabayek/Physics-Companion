import { describe, it, expect } from 'vitest';
import { applyEvent, type GameEvent, type MissionOutcome } from '../src/game/engine/events';
import { defaultProgress } from '../src/game/engine/progress';
import { getMission, missionsByWorld } from '../src/data/missions';
import { REPLAY_REWARD_RATIO } from '../src/game/engine/rewards';
import { buildMissionQuiz } from '../src/game/engine/questions';
import type { AnswerRecord, Mission, Progress } from '../src/types';
import { rightAnswer, wrongAnswer } from './helpers/answers';
import { simulateBoss, type PlannedAnswer } from './helpers/boss';
import { getBoss } from '../src/data/bosses';
import { recordMission } from '../src/game/engine/progress';
import type { Boss, QuizQuestion } from '../src/types';
import type { BossOutcome } from '../src/game/engine/events';
import { getAchievement } from '../src/data/achievements';
import { evaluateAchievements } from '../src/game/engine/achievements';

/** Quanta granted by a list of achievement ids. */
const achQuanta = (ids: string[]) => ids.reduce((sum, id) => sum + (getAchievement(id)?.quanta ?? 0), 0);

const NOW = 1_800_000_000_000;

/** Builds answers for the mission quiz with this seed: `results[i]` = answer question i correctly? */
function quiz(missionId: string, results: boolean[] | 'all' | 'none', opts: { seed?: string; hints?: number[]; timeMs?: number } = {}): GameEvent {
  const seed = opts.seed ?? '1';
  const mission = getMission(missionId);
  const questions = mission ? buildMissionQuiz(mission as Mission, seed) : [];
  const pattern = results === 'all' ? questions.map(() => true) : results === 'none' ? questions.map(() => false) : results;
  const answers: AnswerRecord[] = questions.map((q, i) => ({
    questionId: q.id,
    answer: pattern[i] ? rightAnswer(q) : wrongAnswer(q),
    correct: !!pattern[i],
    hintsUsed: opts.hints?.[i] ?? 0,
    freeHints: 0,
    timeMs: opts.timeMs ?? 4000,
  }));
  return { type: 'MISSION_QUIZ_SUBMITTED', missionId, seed, answers };
}
const run = (p: Progress, e: GameEvent) => applyEvent(p, e, { now: NOW });
const mission = (r: ReturnType<typeof run>) => r.outcome as MissionOutcome;

describe('applyEvent: MISSION_QUIZ_SUBMITTED', () => {
  it('first clear: full Quanta, badge, mission record, stats, notices', () => {
    const r = run(defaultProgress(), quiz('b-speed', 'all'));
    const o = mission(r);
    expect(o).toMatchObject({ kind: 'mission', correct: 4, total: 4, firstClear: true, newBest: true, quanta: 10, badges: ['badge-b-speed'] });
    expect(o.score.stars).toBe(3);
    expect(r.achievements).toEqual(['first-steps', 'first-perfect']);
    expect(r.progress.currency).toBe(10 + achQuanta(r.achievements));
    expect(r.progress.collection.badges).toEqual(['badge-b-speed', 'ach-first-steps', 'ach-first-perfect']);
    expect(r.progress.missions['b-speed']).toMatchObject({ completed: true, stars: 3, attempts: 1, lastPlayed: NOW });
    expect(r.progress.stats).toEqual({
      quizzesTaken: 1,
      questionsAnswered: 4,
      questionsCorrect: 4,
      perfectQuizzes: 1,
      bestAnswerStreak: 4,
      hintsUsed: 0,
      hintFreeQuizzes: 1,
      bossWinsWithoutHints: 0,
      clutchBossWins: 0,
      dailyChallengesCompleted: 0,
      perfectDailies: 0,
      perfectSprints: 0,
      longestSurvival: 0,
      bestChallengeCombo: 0,
      quantaEarned: 10 + achQuanta(r.achievements),
    });
    expect(r.notices.map((n) => n.title)).toEqual([
      'Mission complete: Speed Racer',
      'Badge earned',
      'Streak started!',
      'Achievement unlocked: First Steps',
      'Achievement unlocked: Flawless Logic',
    ]);
  });

  it('0★ attempt: no Quanta, no badge (regression: rewards were unconditional)', () => {
    const r = run(defaultProgress(), quiz('b-speed', 'none'));
    expect(mission(r)).toMatchObject({ firstClear: false, quanta: 0, badges: [] });
    expect(r.progress.currency).toBe(0);
    expect(r.progress.collection.badges).toEqual([]);
    expect(r.progress.missions['b-speed']).toMatchObject({ completed: false, attempts: 1 });
    expect(r.progress.stats.quizzesTaken).toBe(1);
    expect(r.notices).toEqual([]);
  });

  it('replay: small reward only, no duplicate badge (regression: full reward on every replay)', () => {
    const first = run(defaultProgress(), quiz('b-speed', 'all'));
    const replay = run(first.progress, quiz('b-speed', [true, true, true, false], { seed: '2' }));
    const expected = Math.max(1, Math.round(10 * REPLAY_REWARD_RATIO));
    expect(mission(replay)).toMatchObject({ firstClear: false, quanta: expected, badges: [] });
    expect(replay.achievements).toEqual([]);
    expect(replay.progress.currency).toBe(first.progress.currency + expected);
    expect(replay.progress.collection.badges.filter((b) => b === 'badge-b-speed')).toHaveLength(1);
    expect(replay.progress.missions['b-speed']).toMatchObject({ stars: 3, attempts: 2 });
    expect(replay.notices).toEqual([{ kind: 'reward', title: 'Replay reward', message: `+${expected} Quanta` }]);
  });

  it('failing first, then passing, counts as the first clear', () => {
    const fail = run(defaultProgress(), quiz('b-speed', 'none'));
    const pass = run(fail.progress, quiz('b-speed', [true, true, false, false], { seed: '2' }));
    expect(mission(pass)).toMatchObject({ firstClear: true, quanta: 10 });
  });

  it('newBest only when the score improves', () => {
    const a = run(defaultProgress(), quiz('b-speed', 'all', { timeMs: 1000 }));
    const b = run(a.progress, quiz('b-speed', 'all', { timeMs: 14000 }));
    expect(mission(b).newBest).toBe(false);
  });

  it('missions no longer unlock worlds; completing 60% makes the boss appear (once)', () => {
    const beginner = missionsByWorld('beginner');
    let p = defaultProgress();
    const appearedAt: number[] = [];
    beginner.forEach((m, i) => {
      const r = run(p, quiz(m.id, 'all'));
      p = r.progress;
      if (mission(r).bossUnlocked) {
        appearedAt.push(i);
        expect(mission(r).bossUnlocked).toBe('boss-beginner');
        expect(r.notices).toContainEqual({ kind: 'unlock', title: 'A boss has appeared!', message: 'The Inertia Golem awaits in the Beginner world.' });
      }
    });
    expect(appearedAt).toEqual([5]); // the 6th of 10 missions
    expect(p.unlockedWorlds).toEqual(['beginner']);
  });

  it('ignores unknown missions without touching progress', () => {
    const p = defaultProgress();
    const r = run(p, { type: 'MISSION_QUIZ_SUBMITTED', missionId: 'nope', seed: '1', answers: [] });
    expect(r.outcome).toEqual({ kind: 'ignored', reason: 'Unknown mission nope' });
    expect(r.progress).toBe(p);
  });

  it('is pure: input progress is not mutated', () => {
    const p = defaultProgress();
    const snapshot = JSON.stringify(p);
    run(p, quiz('b-speed', 'all'));
    expect(JSON.stringify(p)).toBe(snapshot);
  });
});

describe('applyEvent: re-grading and hints', () => {
  it('the engine re-grades: a wrong answer flagged "correct" by the UI does not count', () => {
    const e = quiz('b-speed', 'none');
    if (e.type !== 'MISSION_QUIZ_SUBMITTED') throw new Error('unexpected');
    const forged = { ...e, answers: e.answers.map((a) => ({ ...a, correct: true })) };
    const r = run(defaultProgress(), forged);
    expect(mission(r)).toMatchObject({ correct: 0, quanta: 0 });
    expect(mission(r).answers.every((a) => !a.correct)).toBe(true);
  });

  it('ignores answers that do not match the quiz built from the seed', () => {
    const e = quiz('i-force', 'all', { seed: '1' });
    if (e.type !== 'MISSION_QUIZ_SUBMITTED') throw new Error('unexpected');
    const p = defaultProgress();
    expect(run(p, { ...e, seed: '2' }).outcome).toMatchObject({ kind: 'ignored' }); // generated ids differ
    expect(run(p, { ...e, answers: e.answers.slice(1) }).outcome).toMatchObject({ kind: 'ignored' });
    expect(run(p, { ...e, seed: '2' }).progress).toBe(p);
  });

  it('hints reduce score, are counted in stats, and are clamped to what exists', () => {
    const clean = run(defaultProgress(), quiz('b-speed', 'all'));
    const hinted = run(defaultProgress(), quiz('b-speed', 'all', { hints: [2, 0, 0, 99] }));
    expect(mission(hinted).score.points).toBeLessThan(mission(clean).score.points);
    // question 4 is generated with 3 hints → 99 is clamped to 3
    expect(mission(hinted).hintsUsed).toBe(5);
    expect(hinted.progress.stats.hintsUsed).toBe(5);
  });

  it('hint-free passes are counted; hinted or failed quizzes are not', () => {
    const clean = run(defaultProgress(), quiz('b-speed', 'all'));
    expect(clean.progress.stats.hintFreeQuizzes).toBe(1);
    const hinted = run(clean.progress, quiz('b-speed', 'all', { seed: '2', hints: [1, 0, 0, 0] }));
    expect(hinted.progress.stats.hintFreeQuizzes).toBe(1);
    const failed = run(hinted.progress, quiz('b-speed', 'none', { seed: '3' }));
    expect(failed.progress.stats.hintFreeQuizzes).toBe(1);
    expect(hinted.progress.stats.perfectQuizzes).toBe(1); // hinted all-correct is not "perfect"
  });

  it('heavy hint use can cost stars and the first-clear reward', () => {
    const pattern = [true, true, false, false];
    const noHints = run(defaultProgress(), quiz('b-speed', pattern));
    expect(mission(noHints).score.stars).toBe(1); // 2/4 = 50%
    expect(mission(noHints).quanta).toBe(10);
    // Concept questions have 2 hints: each correct answer keeps 50% credit → (0.5 + 0.5) / 4 = 25%.
    const allHints = run(defaultProgress(), quiz('b-speed', pattern, { hints: [2, 2, 2, 3] }));
    expect(mission(allHints).score.stars).toBe(0);
    expect(mission(allHints).quanta).toBe(0);
  });
});

describe('applyEvent: BOSS_BATTLE_FINISHED', () => {
  const golem = getBoss('boss-beginner') as Boss;
  const bossOutcome = (r: ReturnType<typeof run>) => r.outcome as BossOutcome;

  /**
   * Progress with the beginner boss unlocked (6 of 10 missions completed). Achievements already
   * earned by that progress are pre-awarded, so each test sees only what the battle unlocks.
   */
  function readyForGolem(): Progress {
    let p = defaultProgress();
    for (const m of missionsByWorld('beginner').slice(0, 6)) p = recordMission(p, m.id, 2, 10, NOW);
    return evaluateAchievements(p, NOW).progress;
  }
  function battleEvent(seed: string, plan: (i: number, q: QuizQuestion) => PlannedAnswer, maxAnswers?: number): GameEvent {
    const { battle } = simulateBoss(golem, seed, plan, maxAnswers);
    return { type: 'BOSS_BATTLE_FINISHED', bossId: golem.id, seed, answers: battle.answers };
  }

  it('is ignored while the boss is locked', () => {
    const p = defaultProgress();
    const r = run(p, battleEvent('1', () => ({ correct: true })));
    expect(r.outcome).toEqual({ kind: 'ignored', reason: 'The Inertia Golem is still locked' });
    expect(r.progress).toBe(p);
  });

  it('first victory: Quanta, badge, Codex cards, next world, record and notices', () => {
    const start = readyForGolem();
    const r = run(start, battleEvent('1', () => ({ correct: true, timeMs: 4000 })));
    const o = bossOutcome(r);
    expect(o).toMatchObject({ kind: 'boss', won: true, retreated: false, heartsLeft: 3, stars: 3, damageDealt: 90, timeMs: 36000, firstDefeat: true, quanta: 100, unlockedWorld: 'intermediate' });
    expect(o.lawsAdded).toEqual(golem.rewards.laws);
    expect(o.constantsAdded).toEqual(golem.rewards.constants);
    expect(r.achievements).toEqual(['on-a-roll', 'unstoppable', 'golem-breaker', 'flawless-victory', 'purist']);
    expect(r.progress.currency).toBe(start.currency + 100 + achQuanta(r.achievements));
    expect(r.progress.collection.badges).toContain('badge-boss-beginner');
    expect(r.progress.collection.laws).toEqual(golem.rewards.laws);
    expect(r.progress.unlockedWorlds).toEqual(['beginner', 'intermediate']);
    expect(r.progress.bosses['boss-beginner']).toEqual({ defeated: true, attempts: 1, bestTimeMs: 36000, bestHeartsLeft: 3, defeatedAt: NOW });
    expect(r.progress.stats).toMatchObject({ questionsAnswered: 9, questionsCorrect: 9, bestAnswerStreak: 9, bossWinsWithoutHints: 1, clutchBossWins: 0 });
    // Many simultaneous achievements are summarised so the important notices are not crowded out.
    expect(r.notices.map((n) => n.title)).toEqual(['The Inertia Golem defeated!', 'New world unlocked!', 'Codex updated', 'Streak started!', '5 achievements unlocked!']);
    expect(r.notices[4]?.message).toBe(`On a Roll, Unstoppable, Golem Breaker, Flawless Victory, Purist · +${achQuanta(r.achievements)} Quanta`);
  });

  it('rematch victory: 20% Quanta, no duplicate cards, best time/hearts tracked', () => {
    const first = run(readyForGolem(), battleEvent('1', (i) => ({ correct: i !== 0, timeMs: 4000 })));
    expect(bossOutcome(first).heartsLeft).toBe(2);
    const again = run(first.progress, battleEvent('2', () => ({ correct: true, timeMs: 3000 })));
    expect(bossOutcome(again)).toMatchObject({ won: true, firstDefeat: false, quanta: 20, newBestTime: true, lawsAdded: [], unlockedWorld: null });
    expect(again.achievements).toEqual(['flawless-victory']); // first win lost a heart
    expect(again.progress.currency).toBe(first.progress.currency + 20 + achQuanta(again.achievements));
    expect(again.progress.bosses['boss-beginner']).toMatchObject({ attempts: 2, bestHeartsLeft: 3, bestTimeMs: 27000, defeatedAt: NOW });
    const slower = run(again.progress, battleEvent('3', () => ({ correct: true, timeMs: 9000 })));
    expect(bossOutcome(slower).newBestTime).toBe(false);
    expect(slower.progress.bosses['boss-beginner']?.bestTimeMs).toBe(27000);
  });

  it('a loss counts as an attempt and pays nothing', () => {
    const start = readyForGolem();
    const r = run(start, battleEvent('1', () => ({ correct: false })));
    expect(r.progress.currency).toBe(start.currency);
    expect(r.achievements).toEqual([]);
    expect(bossOutcome(r)).toMatchObject({ won: false, stars: 0, quanta: 0, unlockedWorld: null });
    expect(r.progress.bosses['boss-beginner']).toEqual({ defeated: false, attempts: 1, bestTimeMs: null, bestHeartsLeft: 0, defeatedAt: null });
    expect(r.progress.unlockedWorlds).toEqual(['beginner']);
    expect(r.notices).toEqual([]);
  });

  it('retreating mid-battle is a loss', () => {
    const r = run(readyForGolem(), battleEvent('1', () => ({ correct: true }), 3));
    expect(bossOutcome(r)).toMatchObject({ won: false, retreated: true, damageDealt: 30 });
  });

  it('clutch and hint-free victories are counted (and unlock their achievements)', () => {
    const clutch = run(readyForGolem(), battleEvent('1', (i) => ({ correct: i >= 2, hints: i === 5 ? 1 : 0 })));
    expect(bossOutcome(clutch)).toMatchObject({ won: true, heartsLeft: 1 });
    expect(clutch.progress.stats).toMatchObject({ clutchBossWins: 1, bossWinsWithoutHints: 0 });
    expect(clutch.achievements).toContain('clutch');
    expect(clutch.achievements).not.toContain('purist');
  });

  it('forged logs are ignored', () => {
    const e = battleEvent('1', () => ({ correct: true }));
    if (e.type !== 'BOSS_BATTLE_FINISHED') throw new Error('unexpected');
    const p = readyForGolem();
    expect(run(p, { ...e, seed: '9' }).outcome.kind).toBe('ignored');
    expect(run(p, { ...e, bossId: 'boss-nope' }).outcome).toEqual({ kind: 'ignored', reason: 'Unknown boss boss-nope' });
  });
});
