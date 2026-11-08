import { describe, it, expect } from 'vitest';
import { ALL_MISSIONS, getMission, missionsByWorld } from '../src/data/missions';
import { GENERATORS } from '../src/data/questions/generators';
import {
  buildMissionQuiz,
  buildQuestionSet,
  generatedQuestionId,
  parseGeneratedQuestionId,
  questionById,
  GENERATED_PER_MISSION,
} from '../src/game/engine/questions';
import type { Mission } from '../src/types';

const m = (id: string) => getMission(id) as Mission;

describe('generated question ids', () => {
  it('round-trip, including seeds that contain colons', () => {
    const id = generatedQuestionId('speed-basic', 'daily:2026-11-07:3');
    expect(id).toBe('gen:speed-basic:daily:2026-11-07:3');
    expect(parseGeneratedQuestionId(id)).toEqual({ generatorId: 'speed-basic', seed: 'daily:2026-11-07:3' });
  });
  it('reject malformed ids', () => {
    for (const bad of ['speed-basic:1', 'gen:', 'gen:speed-basic', 'gen::1', 'gen:speed-basic:']) {
      expect(parseGeneratedQuestionId(bad)).toBeNull();
    }
    expect(questionById('gen:no-such-generator:1')).toBeUndefined();
    expect(questionById('nope')).toBeUndefined();
  });
  it('questionById finds hand-written questions', () => {
    expect(questionById('b-speed-c1')?.prompt).toBe('Which unit is used to measure speed?');
  });
});

describe('buildMissionQuiz', () => {
  it('concept questions first, then the world’s number of generated questions', () => {
    for (const mission of ALL_MISSIONS) {
      const quiz = buildMissionQuiz(mission, '1');
      const generated = mission.generators?.length ? GENERATED_PER_MISSION[mission.world] : 0;
      expect(quiz).toHaveLength(mission.quiz.length + generated);
      expect(quiz.slice(0, mission.quiz.length).map((q) => q.id)).toEqual(mission.quiz.map((q) => q.id));
      expect(new Set(quiz.map((q) => q.id)).size).toBe(quiz.length);
    }
  });

  it('is deterministic per seed and changes the numbers between attempts', () => {
    const a1 = buildMissionQuiz(m('i-force'), '1');
    expect(buildMissionQuiz(m('i-force'), '1')).toEqual(a1);
    const prompts = new Set(['1', '2', '3', '4', '5'].flatMap((s) => buildMissionQuiz(m('i-force'), s).slice(3).map((q) => q.prompt)));
    expect(prompts.size).toBeGreaterThan(2);
  });

  it('shuffles MCQ options (same set), so the answer is not always first', () => {
    let answerFirst = 0;
    let total = 0;
    for (const mission of ALL_MISSIONS) {
      for (const q of buildMissionQuiz(mission, '7')) {
        if (q.type !== 'mcq') continue;
        const original = mission.quiz.find((o) => o.id === q.id)?.options ?? q.options;
        expect([...(q.options ?? [])].sort()).toEqual([...(original ?? [])].sort());
        total++;
        if (q.options?.[0] === q.answer) answerFirst++;
      }
    }
    expect(answerFirst / total).toBeLessThan(0.6);
  });

  it('uses two generators alternately when a mission has two', () => {
    const quiz = buildMissionQuiz(m('i-circuit'), '1');
    expect(quiz.slice(3).map((q) => parseGeneratedQuestionId(q.id)?.generatorId)).toEqual(['ohm-law', 'series-parallel']);
  });
});

describe('buildQuestionSet', () => {
  it('returns the requested count, deterministically, without duplicates', () => {
    const opts = { worlds: ['beginner', 'intermediate'] as const, count: 10, seed: 'daily:2026-11-07' };
    const a = buildQuestionSet(opts);
    expect(a).toHaveLength(10);
    expect(buildQuestionSet(opts)).toEqual(a);
    expect(new Set(a.map((q) => q.id)).size).toBe(10);
    expect(buildQuestionSet({ ...opts, seed: 'daily:2026-11-08' }).map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it('only uses the requested worlds', () => {
    const topics = new Set([...missionsByWorld('beginner'), ...GENERATORS.filter((g) => g.world === 'beginner')].map((x) => x.topic));
    const set = buildQuestionSet({ worlds: ['beginner'], count: 20, seed: 'x' });
    for (const q of set) expect(topics).toContain(q.topic);
    for (const q of set) if (q.id.startsWith('gen:')) expect(GENERATORS.find((g) => g.id === parseGeneratedQuestionId(q.id)?.generatorId)?.world).toBe('beginner');
  });

  it('respects the generated ratio and topic filter', () => {
    const allGenerated = buildQuestionSet({ worlds: ['advanced'], count: 6, seed: 'r', generatedRatio: 1 });
    expect(allGenerated.every((q) => q.id.startsWith('gen:'))).toBe(true);
    const noGenerated = buildQuestionSet({ worlds: ['advanced'], count: 6, seed: 'r', generatedRatio: 0 });
    expect(noGenerated.some((q) => q.id.startsWith('gen:'))).toBe(false);
    const orbits = buildQuestionSet({ worlds: ['advanced'], count: 5, seed: 'r', topics: ['orbits'] });
    expect(orbits.every((q) => q.topic === 'orbits')).toBe(true);
  });

  it('fills with generated questions when concept questions run out', () => {
    const set = buildQuestionSet({ worlds: ['advanced'], count: 8, seed: 'r', topics: ['orbits'], generatedRatio: 0 });
    expect(set).toHaveLength(8);
    expect(set.filter((q) => !q.id.startsWith('gen:'))).toHaveLength(3);
  });

  it('filters by difficulty', () => {
    const set = buildQuestionSet({ worlds: ['expert'], count: 10, seed: 'd', minDifficulty: 3 });
    expect(set.every((q) => q.difficulty === 3)).toBe(true);
  });
});
