import { describe, it, expect } from 'vitest';
import { BOSSES, bossForWorld, getBoss } from '../src/data/bosses';
import { LAWS } from '../src/data/laws';
import { CONSTANTS } from '../src/data/constants';
import { ALL_MISSIONS, missionsByWorld } from '../src/data/missions';
import {
  bossDamage,
  bossStagePools,
  bossStars,
  bossUnlockStatus,
  replayBossBattle,
  stageForHp,
  BOSS_STAGE_POOL_SIZE,
} from '../src/game/engine/boss';
import { defaultProgress, recordMission } from '../src/game/engine/progress';
import { parseGeneratedQuestionId } from '../src/game/engine/questions';
import { GENERATORS } from '../src/data/questions/generators';
import type { Boss } from '../src/types';
import { simulateBoss } from './helpers/boss';

const golem = getBoss('boss-beginner') as Boss;
const sphinx = getBoss('boss-expert') as Boss;

describe('boss data', () => {
  it('one boss per world, each with three stages', () => {
    expect(BOSSES.map((b) => b.world)).toEqual(['beginner', 'intermediate', 'advanced', 'expert']);
    for (const b of BOSSES) expect(b.stages).toHaveLength(3);
    expect(bossForWorld('intermediate')?.name).toBe('The Circuit Hydra');
  });

  it('beating every boss completes the Codex: each law and constant is awarded exactly once', () => {
    const laws = BOSSES.flatMap((b) => b.rewards.laws);
    const constants = BOSSES.flatMap((b) => b.rewards.constants);
    expect([...laws].sort()).toEqual(LAWS.map((l) => l.id).sort());
    expect([...constants].sort()).toEqual(CONSTANTS.map((c) => c.id).sort());
  });
});

describe('boss mechanics', () => {
  it('damage: 10 per correct answer, reduced by paid hints; misses deal none', () => {
    const r = (correct: boolean, hintsUsed = 0, freeHints = 0) => ({ correct, hintsUsed, freeHints });
    expect([0, 1, 2, 3].map((h) => bossDamage(r(true, h)))).toEqual([10, 8, 5, 3]);
    expect(bossDamage(r(true, 1, 1))).toBe(10);
    expect(bossDamage(r(false))).toBe(0);
  });

  it('stage follows HP in thirds', () => {
    expect([90, 61, 60, 31, 30, 1, 0].map(stageForHp)).toEqual([0, 0, 1, 1, 2, 2, 2]);
  });

  it.each(BOSSES.map((b) => [b.name, b] as const))('%s: deterministic stage pools from its own world, no repeats', (_n, boss) => {
    const pools = bossStagePools(boss, '1');
    expect(bossStagePools(boss, '1')).toEqual(pools);
    const ids = pools.flat().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const worldTopics = new Set([...missionsByWorld(boss.world).map((m) => m.topic), ...GENERATORS.filter((g) => g.world === boss.world).map((g) => g.topic)]);
    pools.forEach((pool, i) => {
      expect(pool).toHaveLength(BOSS_STAGE_POOL_SIZE);
      for (const q of pool) expect(worldTopics).toContain(q.topic);
      const minD = boss.stages[i]?.minDifficulty;
      if (minD) for (const q of pool) expect(q.difficulty).toBeGreaterThanOrEqual(minD);
    });
    // Later stages lean more on calculation.
    const generatedShare = pools.map((p) => p.filter((q) => parseGeneratedQuestionId(q.id)).length);
    expect(generatedShare[2]).toBeGreaterThanOrEqual(generatedShare[0] ?? 0);
  });

  it('a flawless run wins in 9 answers with all hearts (3★), passing through all stages', () => {
    const { battle } = simulateBoss(golem, '1', () => ({ correct: true }));
    expect(battle.status).toBe('won');
    expect(battle.answers).toHaveLength(9);
    expect(battle.hearts).toBe(3);
    expect(battle.asked).toEqual([3, 3, 3]);
    expect(bossStars(battle)).toBe(3);
  });

  it('three wrong answers lose the battle', () => {
    const { battle } = simulateBoss(golem, '1', () => ({ correct: false }));
    expect(battle.status).toBe('lost');
    expect(battle.answers).toHaveLength(3);
    expect(battle.hearts).toBe(0);
    expect(bossStars(battle)).toBe(0);
  });

  it('two misses still allow a 1-heart victory', () => {
    const { battle } = simulateBoss(golem, '1', (i) => ({ correct: i !== 0 && i !== 4 }));
    expect(battle.status).toBe('won');
    expect(battle.hearts).toBe(1);
    expect(bossStars(battle)).toBe(1);
  });

  it('hint-heavy play needs more questions but the pools are large enough to win', () => {
    const { battle } = simulateBoss(sphinx, '3', () => ({ correct: true, hints: 3 }));
    expect(battle.status).toBe('won');
    expect(battle.answers).toHaveLength(30); // 3 damage per hit → 10 hits per 30-HP stage
  });

  it('worst case in one stage (2 misses + max hints on every hit) uses exactly the whole pool and still wins', () => {
    const { battle } = simulateBoss(golem, '2', (i) => ({ correct: i >= 2, hints: 3 }));
    expect(battle.asked[0]).toBe(BOSS_STAGE_POOL_SIZE); // 2 misses + 10 hits of 3 damage
    expect(battle.status).toBe('won');
    expect(battle.hearts).toBe(1);
  });
});

describe('replayBossBattle (validation)', () => {
  it('reproduces a simulated battle', () => {
    const { battle } = simulateBoss(golem, '5', (i) => ({ correct: i !== 2 }));
    const replay = replayBossBattle(golem, '5', battle.answers);
    expect(replay).toMatchObject({ valid: true, retreated: false });
    if (replay.valid) expect(replay.battle).toEqual(battle);
  });

  it('re-grades answers: forged "correct" flags do not deal damage', () => {
    const { battle } = simulateBoss(golem, '5', () => ({ correct: false }));
    const forged = battle.answers.map((a) => ({ ...a, correct: true }));
    const replay = replayBossBattle(golem, '5', forged);
    expect(replay.valid && replay.battle.status).toBe('lost');
    expect(replay.valid && replay.battle.hp).toBe(90);
  });

  it('rejects answers for the wrong questions, a wrong seed, or extra answers', () => {
    const { battle } = simulateBoss(golem, '5', () => ({ correct: true }));
    expect(replayBossBattle(golem, '6', battle.answers)).toMatchObject({ valid: false });
    const swapped = [battle.answers[1], battle.answers[0], ...battle.answers.slice(2)].filter((a) => a !== undefined);
    expect(replayBossBattle(golem, '5', swapped)).toMatchObject({ valid: false });
    const extra = [...battle.answers, battle.answers[0]].filter((a) => a !== undefined);
    expect(replayBossBattle(golem, '5', extra)).toMatchObject({ valid: false, reason: 'More answers than the battle allows' });
  });

  it('a log that stops mid-battle is a retreat (loss)', () => {
    const { battle } = simulateBoss(golem, '5', () => ({ correct: true }), 4);
    const replay = replayBossBattle(golem, '5', battle.answers);
    expect(replay).toMatchObject({ valid: true, retreated: true });
    expect(replay.valid && replay.battle.status).toBe('lost');
  });
});

describe('boss unlock', () => {
  it('appears at 60% of the world’s missions', () => {
    const beginner = missionsByWorld('beginner');
    let p = defaultProgress();
    expect(bossUnlockStatus(p, 'beginner')).toEqual({ done: 0, total: 10, needed: 6, unlocked: false });
    for (const m of beginner.slice(0, 5)) p = recordMission(p, m.id, 2, 10);
    expect(bossUnlockStatus(p, 'beginner').unlocked).toBe(false);
    p = recordMission(p, beginner[5]?.id ?? '', 1, 10);
    expect(bossUnlockStatus(p, 'beginner')).toEqual({ done: 6, total: 10, needed: 6, unlocked: true });
    // 7-mission worlds need ceil(4.2) = 5
    expect(bossUnlockStatus(p, 'expert').needed).toBe(5);
    expect(ALL_MISSIONS.length).toBe(31);
  });
});
