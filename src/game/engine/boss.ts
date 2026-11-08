// Boss battles: a pure state machine driven by answer records.
//
// - The boss has 90 HP split across 3 stages (30 HP each); the current stage follows the HP.
// - A correct answer deals 10 damage × hint credit (10 / 8 / 5 / 3); a wrong answer costs a heart.
// - The player has 3 hearts. HP 0 → won. Hearts 0 (or the stage runs out of questions) → lost.
// - Every stage draws from its own deterministic question pool (seeded), so a whole battle can be
//   replayed from (bossId, seed, answers) — used by the reducer and, later, server-side validation.
import type { AnswerRecord, Boss, Difficulty, Progress, QuizQuestion } from '../../types';
import { missionsByWorld } from '../../data/missions';
import { bossForWorld } from '../../data/bosses';
import { buildQuestionSet } from './questions';
import { answerCredit } from './hints';
import { isAnswerCorrect } from './quiz';

export const BOSS_MAX_HP = 90;
export const BOSS_STAGE_HP = 30;
export const BOSS_MAX_HEARTS = 3;
export const BOSS_BASE_DAMAGE = 10;
/** Share of a world's missions to complete before its boss appears. */
export const BOSS_UNLOCK_RATIO = 0.6;
/** Questions per stage pool: enough for the worst case (10 hint-heavy hits + 2 misses). */
export const BOSS_STAGE_POOL_SIZE = 12;

export type BossStatus = 'fighting' | 'won' | 'lost';

export interface BossBattle {
  bossId: string;
  seed: string;
  hp: number;
  hearts: number;
  stage: 0 | 1 | 2;
  /** Questions already used from each stage pool. */
  asked: [number, number, number];
  answers: AnswerRecord[];
  status: BossStatus;
}

export function bossDamage(record: Pick<AnswerRecord, 'correct' | 'hintsUsed' | 'freeHints'>): number {
  return Math.round(BOSS_BASE_DAMAGE * answerCredit(record.correct, record.hintsUsed, record.freeHints));
}

export function stageForHp(hp: number): 0 | 1 | 2 {
  if (hp > 2 * BOSS_STAGE_HP) return 0;
  if (hp > BOSS_STAGE_HP) return 1;
  return 2;
}

/** The three deterministic question pools for a battle (no concept question repeats across stages). */
export function bossStagePools(boss: Boss, seed: string): [QuizQuestion[], QuizQuestion[], QuizQuestion[]] {
  const used = new Set<string>();
  const pools = boss.stages.map((stage, i) => {
    const pool = buildQuestionSet({
      worlds: [boss.world],
      count: BOSS_STAGE_POOL_SIZE,
      seed: `${boss.id}:${seed}:stage${i + 1}`,
      generatedRatio: stage.generatedRatio,
      ...(stage.minDifficulty ? { minDifficulty: stage.minDifficulty } : {}),
      excludeIds: used,
    });
    for (const q of pool) used.add(q.id);
    return pool;
  });
  return pools as [QuizQuestion[], QuizQuestion[], QuizQuestion[]];
}

export function startBossBattle(boss: Boss, seed: string): BossBattle {
  return {
    bossId: boss.id,
    seed,
    hp: BOSS_MAX_HP,
    hearts: BOSS_MAX_HEARTS,
    stage: 0,
    asked: [0, 0, 0],
    answers: [],
    status: 'fighting',
  };
}

export function nextBossQuestion(battle: BossBattle, pools: readonly QuizQuestion[][]): QuizQuestion | undefined {
  if (battle.status !== 'fighting') return undefined;
  return pools[battle.stage]?.[battle.asked[battle.stage]];
}

/** Applies one answer (its `correct` flag is taken as given — re-grade before calling if untrusted). */
export function applyBossAnswer(battle: BossBattle, record: AnswerRecord, pools: readonly QuizQuestion[][]): BossBattle {
  if (battle.status !== 'fighting') return battle;
  const hp = Math.max(0, battle.hp - bossDamage(record));
  const hearts = record.correct ? battle.hearts : battle.hearts - 1;
  const asked = [...battle.asked] as [number, number, number];
  asked[battle.stage] += 1;
  const next: BossBattle = { ...battle, hp, hearts, asked, stage: stageForHp(hp), answers: [...battle.answers, record] };
  if (hp === 0) return { ...next, status: 'won' };
  if (hearts <= 0) return { ...next, status: 'lost' };
  // Out of questions for this stage (only possible with extreme hint use): the boss escapes.
  if (!nextBossQuestion(next, pools)) return { ...next, status: 'lost' };
  return next;
}

export type BossReplay =
  | { valid: true; battle: BossBattle; retreated: boolean }
  | { valid: false; reason: string };

/**
 * Rebuilds a battle from its answer log, re-grading every answer against the question the
 * battle would have asked. A log that ends while still fighting counts as a retreat (lost).
 */
export function replayBossBattle(boss: Boss, seed: string, answers: readonly AnswerRecord[]): BossReplay {
  const pools = bossStagePools(boss, seed);
  let battle = startBossBattle(boss, seed);
  for (const a of answers) {
    const q = nextBossQuestion(battle, pools);
    if (!q) return { valid: false, reason: 'More answers than the battle allows' };
    if (a.questionId !== q.id) return { valid: false, reason: 'Answers do not match the battle' };
    battle = applyBossAnswer(battle, { ...a, correct: isAnswerCorrect(q, a.answer) }, pools);
  }
  if (battle.status === 'fighting') return { valid: true, battle: { ...battle, status: 'lost' }, retreated: true };
  return { valid: true, battle, retreated: false };
}

/** Stars for a battle: hearts left on a win, 0 on a loss. */
export function bossStars(battle: BossBattle): 0 | 1 | 2 | 3 {
  return battle.status === 'won' ? (Math.max(0, Math.min(3, battle.hearts)) as 0 | 1 | 2 | 3) : 0;
}

export interface BossUnlockStatus {
  done: number;
  total: number;
  needed: number;
  unlocked: boolean;
}

export function bossUnlockStatus(progress: Progress, world: Difficulty): BossUnlockStatus {
  const missions = missionsByWorld(world);
  const done = missions.filter((m) => progress.missions[m.id]?.completed).length;
  const needed = Math.ceil(missions.length * BOSS_UNLOCK_RATIO);
  return { done, total: missions.length, needed, unlocked: missions.length > 0 && done >= needed };
}

export function isBossUnlocked(progress: Progress, boss: Boss): boolean {
  return bossUnlockStatus(progress, boss.world).unlocked;
}

export function isBossDefeated(progress: Progress, world: Difficulty): boolean {
  const boss = bossForWorld(world);
  return !!boss && !!progress.bosses[boss.id]?.defeated;
}
