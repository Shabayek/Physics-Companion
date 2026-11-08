import { describe, it, expect } from 'vitest';
import { ALL_MISSIONS, missionsByWorld } from '../src/data/missions';
import { GENERATORS, getGenerator } from '../src/data/questions/generators';

describe('mission content', () => {
  it('has 31 missions with unique ids across 4 worlds', () => {
    expect(ALL_MISSIONS).toHaveLength(31);
    expect(new Set(ALL_MISSIONS.map((m) => m.id)).size).toBe(31);
    expect(missionsByWorld('beginner')).toHaveLength(10);
    expect(missionsByWorld('intermediate')).toHaveLength(7);
    expect(missionsByWorld('advanced')).toHaveLength(7);
    expect(missionsByWorld('expert')).toHaveLength(7);
  });

  it('no placeholder questions remain', () => {
    const prompts = ALL_MISSIONS.flatMap((m) => m.quiz.map((q) => q.prompt));
    for (const bad of ['Physics is fun?', '2 + 2 = ?', 'Compute 5*6', 'Compute 12/3', 'Compute 2^3', 'Which concept does']) {
      expect(prompts.some((p) => p.includes(bad))).toBe(false);
    }
  });

  const questions = ALL_MISSIONS.flatMap((m) => m.quiz.map((q) => ({ m, q })));

  it('question ids are unique and prefixed with their mission id', () => {
    expect(new Set(questions.map(({ q }) => q.id)).size).toBe(questions.length);
    for (const { m, q } of questions) expect(q.id.startsWith(`${m.id}-`)).toBe(true);
  });

  it.each(ALL_MISSIONS.map((m) => [m.id, m] as const))('%s: well-formed quiz', (_id, m) => {
    // Missions without generators get an extra concept question.
    expect(m.quiz.length).toBeGreaterThanOrEqual(m.generators?.length ? 3 : 4);
    for (const q of m.quiz) {
      expect(q.topic).toBe(m.topic);
      expect(q.explanation.length).toBeGreaterThan(20);
      expect(q.hints?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(q.hints?.length ?? 0).toBeLessThanOrEqual(3);
      expect([1, 2, 3]).toContain(q.difficulty);
      if (q.type === 'mcq') {
        const opts = q.options ?? [];
        expect(opts.length).toBeGreaterThanOrEqual(2);
        expect(new Set(opts).size).toBe(opts.length);
        expect(opts.filter((o) => o === q.answer)).toHaveLength(1);
      } else {
        expect(q.type).toBe('truefalse');
        expect(q.options).toEqual(['True', 'False']);
        expect(['True', 'False']).toContain(q.answer);
      }
    }
    for (const g of m.generators ?? []) {
      const gen = getGenerator(g);
      expect(gen, `generator ${g}`).toBeDefined();
      expect(gen?.world).toBe(m.world);
    }
  });

  it('true/false answers are balanced (not all True)', () => {
    const tfs = questions.filter(({ q }) => q.type === 'truefalse');
    const trues = tfs.filter(({ q }) => q.answer === 'True').length;
    expect(trues / tfs.length).toBeGreaterThan(0.3);
    expect(trues / tfs.length).toBeLessThan(0.7);
  });

  it('every generator is used by at least one mission', () => {
    const used = new Set(ALL_MISSIONS.flatMap((m) => m.generators ?? []));
    for (const g of GENERATORS) expect(used, g.id).toContain(g.id);
  });
});
