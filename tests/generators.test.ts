import { describe, it, expect } from 'vitest';
import { GENERATORS } from '../src/data/questions/generators';
import * as G from '../src/data/questions/generators';
import { instantiateGenerator, questionById } from '../src/game/engine/questions';
import { isAnswerCorrect, parseNumericAnswer } from '../src/game/engine/quiz';

const SEEDS = Array.from({ length: 300 }, (_, i) => `s${i}`);
const BAD_TEXT = /NaN|undefined|Infinity|\[object/;

describe.each(GENERATORS.map((g) => [g.id, g] as const))('generator %s', (_id, gen) => {
  const qs = SEEDS.map((s) => instantiateGenerator(gen, s));

  it('produces well-formed questions', () => {
    for (const q of qs) {
      expect(q.prompt).not.toMatch(BAD_TEXT);
      expect(q.explanation).not.toMatch(BAD_TEXT);
      expect(q.hints).toHaveLength(3);
      for (const h of q.hints ?? []) expect(h).not.toMatch(BAD_TEXT);
      expect(q.topic).toBe(gen.topic);
      if (q.type === 'numeric') {
        expect(typeof q.answer).toBe('number');
        expect(Number.isFinite(q.answer)).toBe(true);
        expect(q.answer as number).toBeGreaterThan(0);
        expect(q.answer as number).toBeLessThan(1e7);
        expect(q.answerText).toBeDefined();
      } else {
        expect(q.options).toContain(q.answer);
        expect(new Set(q.options).size).toBe(q.options?.length);
      }
    }
  });

  it('accepts its own displayed (rounded) answer, with or without the unit', () => {
    for (const q of qs) {
      if (q.type !== 'numeric') continue;
      const shown = (q.answerText ?? '').replace(` ${q.unit ?? ''}`, '').trim();
      expect(isAnswerCorrect(q, shown), `${q.prompt} → ${shown}`).toBe(true);
      expect(isAnswerCorrect(q, q.answerText), `${q.answerText}`).toBe(true);
    }
  });

  it('rejects clearly wrong answers', () => {
    for (const q of qs) {
      if (q.type === 'numeric') {
        const t = q.answer as number;
        const wrong = t * 1.25;
        // Only meaningful when 25% is more than two rounding steps.
        if (Math.abs(wrong - t) > 4 * (q.absTolerance ?? 0)) {
          expect(isAnswerCorrect(q, String(wrong)), `${q.prompt} wrong=${wrong}`).toBe(false);
        }
      } else {
        const wrong = (q.options ?? []).find((o) => o !== q.answer);
        expect(isAnswerCorrect(q, wrong)).toBe(false);
      }
    }
  });

  it('is deterministic and rebuildable from its id', () => {
    for (const s of SEEDS.slice(0, 25)) {
      const q = instantiateGenerator(gen, s);
      expect(instantiateGenerator(gen, s)).toEqual(q);
      expect(questionById(q.id)).toEqual(q);
    }
  });

  it('varies across seeds', () => {
    expect(new Set(qs.map((q) => q.prompt)).size).toBeGreaterThan(1);
  });
});

describe('generator physics (known inputs)', () => {
  const ans = (q: { answer: number | string }) => Number(q.answer);

  it('beginner', () => {
    expect(ans(G.speedBasic.build({ v: 5, t: 4, who: 'x', ask: 'speed' }))).toBe(5);
    expect(ans(G.speedBasic.build({ v: 5, t: 4, who: 'x', ask: 'distance' }))).toBe(20);
    expect(ans(G.speedBasic.build({ v: 5, t: 4, who: 'x', ask: 'time' }))).toBe(4);
    expect(ans(G.freeFallBasic.build({ t: 3, ask: 'speed' }))).toBe(30);
    expect(ans(G.freeFallBasic.build({ t: 3, ask: 'distance' }))).toBe(45);
    expect(ans(G.netForceBasic.build({ f1: 50, f2: 20, same: false }))).toBe(30);
    expect(ans(G.netForceBasic.build({ f1: 50, f2: 20, same: true }))).toBe(70);
    expect(ans(G.rampEnergy.build({ ask: 'pe', m: 2, h: 3, hSpeed: 5 }))).toBe(60);
    expect(ans(G.rampEnergy.build({ ask: 'speed', m: 2, h: 3, hSpeed: 45 }))).toBeCloseTo(30, 10);
    expect(ans(G.buoyancyBasic.build({ ask: 'force', volumeL: 3, mass: 1 }))).toBeCloseTo(30, 10);
    expect(G.buoyancyBasic.build({ ask: 'float', volumeL: 3, mass: 1.8 }).answer).toBe('It floats');
    expect(G.buoyancyBasic.build({ ask: 'float', volumeL: 3, mass: 6 }).answer).toBe('It sinks');
    expect(G.pendulumRatio.build({ ask: 'length', k: 9 }).answer).toBe('It becomes 3 times longer');
    expect(ans(G.circuitCurrent.build({ I: 3, R: 4 }))).toBe(3);
  });

  it('intermediate', () => {
    expect(ans(G.newtonSecondLaw.build({ ask: 'a', F: 50, m: 20, a: 1 }))).toBe(2.5);
    expect(ans(G.newtonSecondLaw.build({ ask: 'm', F: 30, m: 1, a: 1.5 }))).toBe(20);
    expect(ans(G.ohmLaw.build({ ask: 'V', I: 2.5, R: 8 }))).toBe(20);
    expect(ans(G.seriesParallel.build({ kind: 'series', r1: 4, r2: 8, V: 12 }))).toBe(1);
    expect(ans(G.seriesParallel.build({ kind: 'parallel', r1: 6, r2: 3, V: 12 }))).toBeCloseTo(2, 10);
    expect(ans(G.waveSpeedGen.build({ ask: 'v', f: 4, lambda: 2.5, fSound: 100 }))).toBe(10);
    expect(ans(G.waveSpeedGen.build({ ask: 'lambda', f: 4, lambda: 2.5, fSound: 686 }))).toBeCloseTo(0.5, 10);
    expect(ans(G.thinLens.build({ f: 10, k: 2, ask: 'v' }))).toBeCloseTo(20, 10);
    expect(ans(G.thinLens.build({ f: 10, k: 1.5, ask: 'v' }))).toBeCloseTo(30, 10);
    expect(ans(G.thinLens.build({ f: 10, k: 3, ask: 'mag' }))).toBeCloseTo(0.5, 10);
    expect(ans(G.momentumGen.build({ ask: 'stick', m1: 2, m2: 1, v1: 6 }))).toBeCloseTo(4, 10);
    expect(ans(G.pendulumPeriodGen.build({ L: 1 }))).toBeCloseTo(2.007, 3);
    expect(ans(G.archimedes.build({ ask: 'force', fluid: { name: 'w', rho: 1000 }, volumeL: 10, density: 2700 }))).toBeCloseTo(98, 6);
    // Steel (7800 kg/m³), 1 L: weight 76.44 N − buoyancy 9.8 N = 66.64 N.
    expect(ans(G.archimedes.build({ ask: 'apparent', fluid: { name: 'w', rho: 1000 }, volumeL: 1, density: 7800 }))).toBeCloseTo(66.64, 6);
  });

  it('advanced', () => {
    expect(ans(G.projectile.build({ v: 20, theta: 45, ask: 'range' }))).toBeCloseTo(40.816, 3);
    expect(ans(G.projectile.build({ v: 20, theta: 30, ask: 'height' }))).toBeCloseTo(5.102, 3);
    expect(ans(G.projectile.build({ v: 20, theta: 30, ask: 'time' }))).toBeCloseTo(2.041, 3);
    expect(ans(G.orbitalVelocityGen.build({ orbit: { name: 'ISS', h: 420 }, ask: 'speed' }))).toBeCloseTo(7.66, 2);
    expect(ans(G.orbitalVelocityGen.build({ orbit: { name: 'geo', h: 35786 }, ask: 'period' }))).toBeCloseTo(23.93, 1);
    expect(ans(G.carnot.build({ celsius: true, Th: 0, Tc: 0, ThC: 227, TcC: 27 }))).toBeCloseTo(39.99, 2);
    expect(ans(G.carnot.build({ celsius: false, Th: 600, Tc: 300, ThC: 0, TcC: 0 }))).toBeCloseTo(50, 10);
    expect(ans(G.faraday.build({ N: 100, areaCm2: 20, dB: 0.5, dt: 0.1 }))).toBeCloseTo(1, 10);
    expect(ans(G.springPeriodGen.build({ m: 1, k: 100, ask: 'T' }))).toBeCloseTo(0.6283, 4);
    expect(ans(G.bernoulliGen.build({ v1: 2, v2: 6 }))).toBeCloseTo(16, 10);
    expect(ans(G.dopplerGen.build({ f0: 500, vs: 43, approaching: true }))).toBeCloseTo(571.67, 2);
    expect(ans(G.dopplerGen.build({ f0: 500, vs: 57, approaching: false }))).toBeCloseTo(428.75, 2);
  });

  it('expert', () => {
    expect(ans(G.timeDilationGen.build({ beta: 0.6, t0: 4, ask: 'gamma' }))).toBeCloseTo(1.25, 10);
    expect(ans(G.timeDilationGen.build({ beta: 0.8, t0: 6, ask: 'time' }))).toBeCloseTo(10, 10);
    expect(ans(G.timeDilationGen.build({ beta: 0.6, t0: 10, ask: 'length' }))).toBeCloseTo(80, 10);
    expect(ans(G.photoelectric.build({ metal: { name: 'sodium', phi: 2.28 }, nm: 400, ask: 'ke' }))).toBeCloseTo(0.8196, 3);
    expect(ans(G.photoelectric.build({ metal: { name: 'sodium', phi: 2.28 }, nm: 400, ask: 'threshold' }))).toBeCloseTo(543.8, 0);
    expect(ans(G.tunneling.build({ T0: 0.5, n: 2 }))).toBeCloseTo(25, 10);
    expect(ans(G.tunneling.build({ T0: 0.1, n: 3 }))).toBeCloseTo(0.1, 10);
    expect(ans(G.halfLife.build({ N0: 1600, T: 5, unit: 'days', n: 3, ask: 'remaining' }))).toBe(200);
    expect(ans(G.halfLife.build({ N0: 1600, T: 5, unit: 'days', n: 3, ask: 'lambda' }))).toBeCloseTo(0.1386, 4);
    expect(ans(G.rlcResonance.build({ LmH: 10, CuF: 10 }))).toBeCloseTo(503.29, 2);
    expect(ans(G.hubble.build({ d: 100, ask: 'v' }))).toBe(7000);
    expect(ans(G.entropyGen.build({ ask: 'melt', m: 1, QkJ: 0, T: 300 }))).toBeCloseTo(1222.77, 2);
    expect(ans(G.entropyGen.build({ ask: 'reservoir', m: 1, QkJ: 300, T: 300 }))).toBeCloseTo(1000, 10);
  });
});

describe('parseNumericAnswer', () => {
  it.each([
    ['4', 4], [' 4 m/s', 4], ['1,5', 1.5], ['4,900', 4900], ['1,234,567.5', 1234567.5], ['4,900 J', 4900],
    ['0,25', 0.25], ['12,3456', 12.3456], ['3e8', 3e8], ['-2.5', -2.5], ['.5', 0.5], ['7.', 7],
    ['1.2.3', null], ['2 3', null], ['', null], ['abc', null],
  ] as const)('%j → %j', (text, expected) => {
    expect(parseNumericAnswer(text)).toBe(expected);
  });
});
