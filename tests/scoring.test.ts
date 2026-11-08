import { describe, it, expect } from 'vitest';
import { computeScore, longestRun, pointsForAnswer, starsFromScore } from '../src/game/engine/scoring';
import { defaultProgress, recordMission, unlockNextWorld } from '../src/game/engine/progress';

describe('scoring', () => {
  it('points', () => {
    expect(pointsForAnswer(true, 2, 5, 1)).toBe(20 + 5 + 2);
    expect(pointsForAnswer(false, 2)).toBe(0);
  });
  it('stars', () => {
    expect(starsFromScore(95, 100)).toBe(3);
    expect(starsFromScore(40, 100)).toBe(1);
  });
});

describe('computeScore', () => {
  it('a perfect quiz earns 3 stars regardless of time (regression: was capped at 2★)', () => {
    expect(computeScore(3, 3, 20, 3).stars).toBe(3);
    expect(computeScore(3, 3, 600, 3).stars).toBe(3);
  });

  it('stars follow accuracy', () => {
    expect(computeScore(0, 3, 10, 0).stars).toBe(0);
    expect(computeScore(1, 3, 10, 1).stars).toBe(1);
    expect(computeScore(2, 3, 10, 2).stars).toBe(2);
  });

  it('no speed bonus or points for fast wrong answers (regression: 0 correct scored 10)', () => {
    const r = computeScore(0, 3, 1, 0);
    expect(r.points).toBe(0);
    expect(r.speedBonus).toBe(0);
    expect(r.bonuses).not.toContain('speed');
  });

  it('speed bonus scales with unused time budget (15 s/question) and correct answers', () => {
    expect(computeScore(3, 3, 0, 0).speedBonus).toBe(15); // 5 per correct answer
    expect(computeScore(3, 3, 22.5, 0).speedBonus).toBe(8); // half the 45 s budget left → 7.5 → 8
    expect(computeScore(3, 3, 45, 0).speedBonus).toBe(0);
    expect(computeScore(3, 3, 90, 0).speedBonus).toBe(0);
  });

  it('uses the real time: slower quizzes score fewer points', () => {
    expect(computeScore(3, 3, 5, 3).points).toBeGreaterThan(computeScore(3, 3, 40, 3).points);
  });

  it('bonus flags', () => {
    expect(computeScore(3, 3, 10, 3).bonuses).toEqual(['speed', 'streak', 'perfect']);
    expect(computeScore(3, 3, 40, 3).bonuses).toEqual(['streak', 'perfect']);
    expect(computeScore(2, 3, 40, 2).bonuses).toEqual([]);
  });

  it('sanitises invalid inputs', () => {
    expect(computeScore(5, 3, NaN, 10)).toMatchObject({ stars: 3, streak: 3, speedBonus: 0 });
    expect(computeScore(-1, 3, -5, -2)).toMatchObject({ points: 0, stars: 0, streak: 0 });
    expect(computeScore(0, 0, 0, 0)).toMatchObject({ points: 0, stars: 0, bonuses: [] });
  });

  it('longestRun', () => {
    expect(longestRun([])).toBe(0);
    expect(longestRun([true, true, false, true])).toBe(2);
    expect(longestRun([false, true, true, true])).toBe(3);
  });
});

describe('progress', () => {
  it('record and unlock', () => {
    let p = defaultProgress();
    p = recordMission(p, 'm1', 3, 100);
    expect(p.missions['m1']?.completed).toBe(true);
    p = { ...p, unlockedWorlds: ['beginner'] };
    const p2 = unlockNextWorld(p, 'beginner');
    expect(p2.unlockedWorlds).toContain('intermediate');
  });

  it('recordMission keeps best stars/score and counts attempts', () => {
    let p = recordMission(defaultProgress(), 'm1', 3, 100, 1000);
    p = recordMission(p, 'm1', 1, 40, 2000);
    expect(p.missions['m1']).toEqual({ missionId: 'm1', completed: true, stars: 3, bestScore: 100, attempts: 2, lastPlayed: 2000 });
  });
});
