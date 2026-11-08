// Seeded numeric/conceptual question generators. Every answer is computed with the physics
// engine (src/game/engine/physics.ts) — never typed by hand — so it is always consistent.
// Beginner questions use g = 10 m/s² for easy mental arithmetic (stated in the prompt);
// later worlds use g = 9.8 m/s².
import * as P from '../../game/engine/physics';
import { celsiusToKelvin } from '../../lib/units';
import { defineGenerator, fmt, num, type AnyQuestionGenerator } from '../../game/engine/questionTypes';

const G_EASY = 10;
const G_STD = 9.8;
const V_SOUND = 343;
const M_EARTH = 5.972e24;
const R_EARTH_KM = 6371;
const L_FUSION_ICE = 334_000; // J/kg
const H0 = 70; // km/s/Mpc

// ============================================================ Beginner =====

export const speedBasic = defineGenerator({
  id: 'speed-basic',
  topic: 'speed',
  world: 'beginner',
  difficulty: 1,
  params: (rng) => ({
    v: rng.int(2, 12),
    t: rng.int(2, 10),
    who: rng.pick(['cyclist', 'runner', 'toy car', 'robot turtle', 'skater']),
    ask: rng.pick(['speed', 'distance', 'time'] as const),
  }),
  build: ({ v, t, who, ask }) => {
    const d = P.displacement(v, 0, t); // steady speed: s = v t
    if (ask === 'distance') {
      return {
        type: 'numeric',
        prompt: `A ${who} moves at a steady ${v} m/s for ${t} s. How far does it travel?`,
        answer: d,
        unit: 'm',
        decimals: 0,
        explanation: `distance = speed × time = ${v} × ${t} = ${num(d)} m.`,
        hints: ['Each second it covers the same distance.', 'distance = speed × time', `distance = ${v} m/s × ${t} s`],
      };
    }
    if (ask === 'time') {
      const time = d / v;
      return {
        type: 'numeric',
        prompt: `A ${who} needs to cover ${num(d)} m at a steady ${v} m/s. How many seconds does it take?`,
        answer: time,
        unit: 's',
        decimals: 0,
        explanation: `time = distance ÷ speed = ${num(d)} ÷ ${v} = ${num(time)} s.`,
        hints: ['How many seconds until all the metres are covered?', 'time = distance ÷ speed', `time = ${num(d)} m ÷ ${v} m/s`],
      };
    }
    const speed = P.averageSpeed(d, t);
    return {
      type: 'numeric',
      prompt: `A ${who} travels ${num(d)} m in ${t} s at a steady pace. What is its speed?`,
      answer: speed,
      unit: 'm/s',
      decimals: 0,
      explanation: `speed = distance ÷ time = ${num(d)} ÷ ${t} = ${num(speed)} m/s.`,
      hints: ['Speed tells you how many metres are covered each second.', 'speed = distance ÷ time', `speed = ${num(d)} m ÷ ${t} s`],
    };
  },
});

export const freeFallBasic = defineGenerator({
  id: 'free-fall-basic',
  topic: 'free-fall',
  world: 'beginner',
  difficulty: 1,
  params: (rng) => ({ t: rng.int(1, 5), ask: rng.pick(['speed', 'distance'] as const) }),
  build: ({ t, ask }) => {
    if (ask === 'distance') {
      const d = P.displacement(0, G_EASY, t);
      return {
        type: 'numeric',
        prompt: `A ball is dropped from rest. Ignoring air resistance and using g = 10 m/s², how far has it fallen after ${t} s?`,
        answer: d,
        unit: 'm',
        decimals: 0,
        explanation: `d = ½ g t² = ½ × 10 × ${t}² = ${num(d)} m.`,
        hints: ['The ball keeps speeding up, so it covers more distance every second.', 'd = ½ × g × t²', `d = ½ × 10 × ${t}² = 5 × ${t * t}`],
      };
    }
    const v = P.velocity(0, G_EASY, t);
    return {
      type: 'numeric',
      prompt: `A ball is dropped from rest. Ignoring air resistance and using g = 10 m/s², how fast is it falling after ${t} s?`,
      answer: v,
      unit: 'm/s',
      decimals: 0,
      explanation: `v = g t = 10 × ${t} = ${num(v)} m/s.`,
      hints: ['A falling object gains the same amount of speed every second.', 'v = g × t (starting from rest)', `v = 10 m/s² × ${t} s`],
    };
  },
});

export const netForceBasic = defineGenerator({
  id: 'net-force-basic',
  topic: 'forces',
  world: 'beginner',
  difficulty: 1,
  params: (rng) => {
    const f1 = rng.int(3, 12) * 5;
    const f2 = rng.int(1, f1 / 5 - 1) * 5;
    return { f1, f2, same: rng.next() < 0.35 };
  },
  build: ({ f1, f2, same }) => {
    if (same) {
      const net = P.netForce([f1, f2]);
      return {
        type: 'numeric',
        prompt: `Two friends push a box in the same direction, one with ${f1} N and the other with ${f2} N. What is the net force on the box? (Ignore friction.)`,
        answer: net,
        unit: 'N',
        decimals: 0,
        explanation: `Forces in the same direction add: ${f1} + ${f2} = ${num(net)} N.`,
        hints: ['Both pushes point the same way, so they help each other.', 'net force = first push + second push', `${f1} N + ${f2} N`],
      };
    }
    const net = Math.abs(P.netForce([f1, -f2]));
    return {
      type: 'numeric',
      prompt: `In a tug of war, one team pulls with ${f1} N and the other with ${f2} N in the opposite direction. What is the size of the net force?`,
      answer: net,
      unit: 'N',
      decimals: 0,
      explanation: `Opposite forces subtract: ${f1} − ${f2} = ${num(net)} N, towards the stronger team.`,
      hints: ['Forces in opposite directions work against each other.', 'net force = bigger force − smaller force', `${f1} N − ${f2} N`],
    };
  },
});

export const rampEnergy = defineGenerator({
  id: 'ramp-energy',
  topic: 'energy',
  world: 'beginner',
  difficulty: 1,
  params: (rng) => ({
    ask: rng.pick(['pe', 'speed'] as const),
    m: rng.int(1, 10),
    h: rng.int(1, 10),
    hSpeed: rng.pick([5, 20, 45, 80]),
  }),
  build: ({ ask, m, h, hSpeed }) => {
    if (ask === 'speed') {
      const v = Math.sqrt(P.vSquared(0, G_EASY, hSpeed));
      return {
        type: 'numeric',
        prompt: `A skateboarder starts from rest at the top of a frictionless ramp ${hSpeed} m high. Using g = 10 m/s², how fast is she moving at the bottom?`,
        answer: v,
        unit: 'm/s',
        decimals: 0,
        explanation: `mgh = ½mv², so v = √(2gh) = √(2 × 10 × ${hSpeed}) = √${2 * G_EASY * hSpeed} = ${num(v)} m/s.`,
        hints: [
          'All the potential energy at the top becomes kinetic energy at the bottom.',
          '½mv² = mgh, so v = √(2gh) — the mass cancels out!',
          `v = √(2 × 10 × ${hSpeed}) = √${2 * G_EASY * hSpeed}`,
        ],
      };
    }
    const pe = P.potentialEnergy(m, G_EASY, h);
    return {
      type: 'numeric',
      prompt: `A ${m} kg box sits on a shelf ${h} m above the floor. Using g = 10 m/s², how much gravitational potential energy does it have?`,
      answer: pe,
      unit: 'J',
      decimals: 0,
      explanation: `PE = m g h = ${m} × 10 × ${h} = ${num(pe)} J.`,
      hints: ['Heavier and higher objects store more energy.', 'PE = m × g × h', `PE = ${m} × 10 × ${h}`],
    };
  },
});

export const buoyancyBasic = defineGenerator({
  id: 'buoyancy-basic',
  topic: 'buoyancy',
  world: 'beginner',
  difficulty: 1,
  params: (rng) => {
    const volumeL = rng.int(1, 10);
    // Mass chosen so density is clearly above or below water (never equal).
    const floats = rng.next() < 0.5;
    const mass = floats ? rng.int(1, Math.max(1, volumeL - 1)) * 0.9 : volumeL * rng.pick([1.5, 2, 3, 7.8]);
    return { ask: rng.pick(['force', 'float'] as const), volumeL, mass: Math.round(mass * 10) / 10 };
  },
  build: ({ ask, volumeL, mass }) => {
    const V = volumeL / 1000;
    if (ask === 'float') {
      const density = mass / V;
      const floats = density < 1000;
      return {
        type: 'mcq',
        prompt: `An object has a mass of ${num(mass)} kg and a volume of ${volumeL} litres (${num(V)} m³). What happens when you put it in water (density 1000 kg/m³)?`,
        answer: floats ? 'It floats' : 'It sinks',
        options: ['It floats', 'It sinks'],
        explanation: `Density = mass ÷ volume = ${num(mass)} ÷ ${num(V)} = ${num(density, 0)} kg/m³. ${floats ? 'That is less than water, so it floats.' : 'That is more than water, so it sinks.'}`,
        hints: ['Compare how heavy the object is for its size with water.', 'density = mass ÷ volume; it floats if its density is less than 1000 kg/m³', `density = ${num(mass)} kg ÷ ${num(V)} m³`],
      };
    }
    const fb = P.buoyancy(1000, V, G_EASY);
    return {
      type: 'numeric',
      prompt: `A ball with a volume of ${volumeL} litres (${num(V)} m³) is held completely under water. Using water density 1000 kg/m³ and g = 10 m/s², what is the buoyant force on it?`,
      answer: fb,
      unit: 'N',
      decimals: 0,
      explanation: `F_b = ρ V g = 1000 × ${num(V)} × 10 = ${num(fb)} N — the weight of the water pushed aside.`,
      hints: ['The water pushes up with a force equal to the weight of the water the ball pushes aside.', 'F_b = ρ × V × g', `F_b = 1000 × ${num(V)} × 10`],
    };
  },
});

export const pendulumRatio = defineGenerator({
  id: 'pendulum-ratio',
  topic: 'pendulum',
  world: 'beginner',
  difficulty: 1,
  params: (rng) => ({ ask: rng.pick(['length', 'mass'] as const), k: rng.pick([4, 9, 16]) }),
  build: ({ ask, k }) => {
    if (ask === 'mass') {
      return {
        type: 'truefalse',
        prompt: 'If you double the mass of a pendulum bob (keeping the string the same length), its period doubles.',
        answer: 'False',
        explanation: `The period T = 2π√(L/g) does not contain the mass, so a heavier bob swings with the same period.`,
        hints: ['Think about the pendulum formula — which quantities appear in it?', 'T = 2π√(L/g)', 'Mass is not in the formula at all.'],
      };
    }
    const ratio = P.pendulumPeriod(k) / P.pendulumPeriod(1);
    const r = num(ratio);
    return {
      type: 'mcq',
      prompt: `A pendulum's string is made ${k} times longer. What happens to its period (the time for one full swing)?`,
      answer: `It becomes ${r} times longer`,
      options: [`It becomes ${r} times longer`, `It becomes ${k} times longer`, 'It stays the same', `It becomes ${r} times shorter`],
      explanation: `T = 2π√(L/g), so the period grows with the square root of the length: √${k} = ${r}.`,
      hints: ['Longer pendulums swing more slowly — but not in direct proportion.', 'T = 2π√(L/g): the period depends on the square root of the length.', `What is √${k}?`],
    };
  },
});

export const circuitCurrent = defineGenerator({
  id: 'circuit-current',
  topic: 'circuits',
  world: 'beginner',
  difficulty: 1,
  params: (rng) => ({ I: rng.int(1, 5), R: rng.pick([2, 3, 4, 5, 6, 10, 12]) }),
  build: ({ I, R }) => {
    const V = P.ohmVoltage(I, R);
    const current = P.ohmCurrent(V, R);
    return {
      type: 'numeric',
      prompt: `A ${num(V)} V battery is connected to a lamp with a resistance of ${R} Ω. What current flows?`,
      answer: current,
      unit: 'A',
      decimals: 0,
      explanation: `I = V ÷ R = ${num(V)} ÷ ${R} = ${num(current)} A.`,
      hints: ['More voltage pushes more current; more resistance lets less through.', 'I = V ÷ R', `I = ${num(V)} V ÷ ${R} Ω`],
    };
  },
});

// ======================================================== Intermediate =====

export const newtonSecondLaw = defineGenerator({
  id: 'newton-second-law',
  topic: 'newton-second-law',
  world: 'intermediate',
  difficulty: 2,
  params: (rng) => ({
    ask: rng.pick(['a', 'F', 'm'] as const),
    F: rng.int(2, 20) * 5,
    m: rng.int(2, 25),
    a: rng.int(1, 12) / 2,
  }),
  build: ({ ask, F, m, a }) => {
    if (ask === 'F') {
      const force = P.newtonSecond(m, a);
      return {
        type: 'numeric',
        prompt: `What net force is needed to accelerate a ${m} kg trolley at ${num(a)} m/s²?`,
        answer: force,
        unit: 'N',
        decimals: 1,
        explanation: `F = m a = ${m} × ${num(a)} = ${fmt(force, 1)} N.`,
        hints: ['More mass or more acceleration needs more force.', 'F = m × a', `F = ${m} kg × ${num(a)} m/s²`],
      };
    }
    if (ask === 'm') {
      const mass = F / a;
      return {
        type: 'numeric',
        prompt: `A net force of ${F} N gives a crate an acceleration of ${num(a)} m/s². What is the crate's mass?`,
        answer: mass,
        unit: 'kg',
        decimals: 2,
        explanation: `m = F ÷ a = ${F} ÷ ${num(a)} = ${fmt(mass)} kg.`,
        hints: ['Rearrange Newton’s second law for the mass.', 'm = F ÷ a', `m = ${F} N ÷ ${num(a)} m/s²`],
      };
    }
    const acc = P.acceleration(F, m);
    return {
      type: 'numeric',
      prompt: `A net force of ${F} N acts on a ${m} kg cart. What is its acceleration?`,
      answer: acc,
      unit: 'm/s²',
      decimals: 2,
      explanation: `a = F ÷ m = ${F} ÷ ${m} = ${fmt(acc)} m/s².`,
      hints: ['The same force accelerates a heavier object less.', 'a = F ÷ m', `a = ${F} N ÷ ${m} kg`],
    };
  },
});

export const ohmLaw = defineGenerator({
  id: 'ohm-law',
  topic: 'ohms-law',
  world: 'intermediate',
  difficulty: 2,
  params: (rng) => ({ ask: rng.pick(['V', 'I', 'R'] as const), I: rng.int(1, 10) / 2, R: rng.int(2, 60) }),
  build: ({ ask, I, R }) => {
    const V = P.ohmVoltage(I, R);
    if (ask === 'I') {
      const current = P.ohmCurrent(V, R);
      return {
        type: 'numeric',
        prompt: `A ${num(V)} V supply drives current through a ${R} Ω resistor. What is the current?`,
        answer: current,
        unit: 'A',
        decimals: 2,
        explanation: `I = V ÷ R = ${num(V)} ÷ ${R} = ${fmt(current)} A.`,
        hints: ['Ohm’s law links voltage, current and resistance.', 'I = V ÷ R', `I = ${num(V)} V ÷ ${R} Ω`],
      };
    }
    if (ask === 'R') {
      const res = P.ohmResistance(V, I);
      return {
        type: 'numeric',
        prompt: `A current of ${num(I)} A flows when ${num(V)} V is applied across a component. What is its resistance?`,
        answer: res,
        unit: 'Ω',
        decimals: 1,
        explanation: `R = V ÷ I = ${num(V)} ÷ ${num(I)} = ${fmt(res, 1)} Ω.`,
        hints: ['Ohm’s law links voltage, current and resistance.', 'R = V ÷ I', `R = ${num(V)} V ÷ ${num(I)} A`],
      };
    }
    return {
      type: 'numeric',
      prompt: `A current of ${num(I)} A flows through a ${R} Ω resistor. What is the voltage across it?`,
      answer: V,
      unit: 'V',
      decimals: 1,
      explanation: `V = I R = ${num(I)} × ${R} = ${fmt(V, 1)} V.`,
      hints: ['Ohm’s law links voltage, current and resistance.', 'V = I × R', `V = ${num(I)} A × ${R} Ω`],
    };
  },
});

export const seriesParallel = defineGenerator({
  id: 'series-parallel',
  topic: 'ohms-law',
  world: 'intermediate',
  difficulty: 2,
  params: (rng) => ({
    kind: rng.pick(['series', 'parallel'] as const),
    r1: rng.int(2, 40),
    r2: rng.int(2, 40),
    V: rng.pick([6, 9, 12, 24]),
  }),
  build: ({ kind, r1, r2, V }) => {
    if (kind === 'parallel') {
      const rt = P.parallelResistance([r1, r2]);
      return {
        type: 'numeric',
        prompt: `Resistors of ${r1} Ω and ${r2} Ω are connected in parallel. What is their combined resistance?`,
        answer: rt,
        unit: 'Ω',
        decimals: 2,
        explanation: `1/R = 1/${r1} + 1/${r2}, so R = (${r1} × ${r2}) ÷ (${r1} + ${r2}) = ${fmt(rt)} Ω — less than either resistor.`,
        hints: ['Parallel paths give the current more ways through, so the total is smaller than either resistor.', '1/R = 1/R₁ + 1/R₂ (for two: R = R₁R₂ ÷ (R₁ + R₂))', `R = (${r1} × ${r2}) ÷ (${r1} + ${r2})`],
      };
    }
    const rt = P.seriesResistance([r1, r2]);
    const I = P.ohmCurrent(V, rt);
    return {
      type: 'numeric',
      prompt: `A ${V} V battery is connected to ${r1} Ω and ${r2} Ω resistors in series. What current flows?`,
      answer: I,
      unit: 'A',
      decimals: 2,
      explanation: `In series the resistances add: R = ${r1} + ${r2} = ${rt} Ω. Then I = V ÷ R = ${V} ÷ ${rt} = ${fmt(I)} A.`,
      hints: ['The same current flows through both resistors in series.', 'R_total = R₁ + R₂, then I = V ÷ R_total', `I = ${V} V ÷ (${r1} + ${r2}) Ω`],
    };
  },
});

export const waveSpeedGen = defineGenerator({
  id: 'wave-speed',
  topic: 'waves',
  world: 'intermediate',
  difficulty: 2,
  params: (rng) => ({
    ask: rng.pick(['v', 'lambda'] as const),
    f: rng.int(2, 20),
    lambda: rng.int(1, 12) / 4,
    fSound: rng.int(10, 100) * 10,
  }),
  build: ({ ask, f, lambda, fSound }) => {
    if (ask === 'lambda') {
      const wl = V_SOUND / fSound;
      return {
        type: 'numeric',
        prompt: `A tuning fork produces a ${fSound} Hz note. Taking the speed of sound in air as ${V_SOUND} m/s, what is the wavelength?`,
        answer: wl,
        unit: 'm',
        decimals: 2,
        explanation: `λ = v ÷ f = ${V_SOUND} ÷ ${fSound} = ${fmt(wl)} m.`,
        hints: ['Higher-pitched sounds have shorter wavelengths.', 'v = f λ, so λ = v ÷ f', `λ = ${V_SOUND} ÷ ${fSound}`],
      };
    }
    const v = P.waveSpeed(f, lambda);
    return {
      type: 'numeric',
      prompt: `Waves on a rope have a frequency of ${f} Hz and a wavelength of ${num(lambda)} m. How fast do they travel?`,
      answer: v,
      unit: 'm/s',
      decimals: 2,
      explanation: `v = f λ = ${f} × ${num(lambda)} = ${fmt(v)} m/s.`,
      hints: ['Each second, f wavelengths pass a point.', 'v = f × λ', `v = ${f} Hz × ${num(lambda)} m`],
    };
  },
});

export const thinLens = defineGenerator({
  id: 'thin-lens',
  topic: 'lenses',
  world: 'intermediate',
  difficulty: 2,
  params: (rng) => ({ f: rng.pick([5, 10, 12, 15, 20]), k: rng.pick([1.5, 2, 3, 5]), ask: rng.pick(['v', 'mag'] as const) }),
  build: ({ f, k, ask }) => {
    const u = f * k;
    const v = P.lensFormula(f, u);
    if (ask === 'mag') {
      const m = Math.abs(P.magnification(v, u));
      return {
        type: 'numeric',
        prompt: `An object stands ${num(u)} cm from a converging lens with focal length ${f} cm. The image forms ${num(v)} cm behind the lens. What is the size of the magnification?`,
        answer: m,
        decimals: 2,
        explanation: `|m| = v ÷ u = ${num(v)} ÷ ${num(u)} = ${fmt(m)} (the real image is inverted).`,
        hints: ['Magnification compares image distance with object distance.', '|m| = v ÷ u', `|m| = ${num(v)} ÷ ${num(u)}`],
      };
    }
    return {
      type: 'numeric',
      prompt: `An object is placed ${num(u)} cm from a converging lens of focal length ${f} cm. How far from the lens does the image form?`,
      answer: v,
      unit: 'cm',
      decimals: 1,
      explanation: `1/v = 1/f − 1/u = 1/${f} − 1/${num(u)}, so v = f u ÷ (u − f) = ${fmt(v, 1)} cm.`,
      hints: ['The object is beyond the focal point, so a real image forms on the other side.', '1/f = 1/u + 1/v, so 1/v = 1/f − 1/u', `1/v = 1/${f} − 1/${num(u)}`],
    };
  },
});

export const momentumGen = defineGenerator({
  id: 'momentum',
  topic: 'momentum',
  world: 'intermediate',
  difficulty: 2,
  params: (rng) => ({
    ask: rng.pick(['p', 'stick'] as const),
    m1: rng.int(1, 6),
    m2: rng.int(1, 6),
    v1: rng.int(2, 10),
  }),
  build: ({ ask, m1, m2, v1 }) => {
    if (ask === 'p') {
      const p = P.momentum(m1, v1);
      return {
        type: 'numeric',
        prompt: `A ${m1} kg ball rolls at ${v1} m/s. What is its momentum?`,
        answer: p,
        unit: 'kg·m/s',
        decimals: 0,
        explanation: `p = m v = ${m1} × ${v1} = ${num(p)} kg·m/s.`,
        hints: ['Momentum combines how heavy and how fast something is.', 'p = m × v', `p = ${m1} kg × ${v1} m/s`],
      };
    }
    const { v1f } = P.inelasticCollision(m1, v1, m2, 0);
    return {
      type: 'numeric',
      prompt: `A ${m1} kg cart moving at ${v1} m/s hits a stationary ${m2} kg cart and they stick together. How fast do they move afterwards?`,
      answer: v1f,
      unit: 'm/s',
      decimals: 2,
      explanation: `Momentum is conserved: ${m1} × ${v1} = (${m1} + ${m2}) v, so v = ${m1 * v1} ÷ ${m1 + m2} = ${fmt(v1f)} m/s.`,
      hints: ['Total momentum before the collision equals total momentum after.', 'm₁v₁ = (m₁ + m₂) v', `v = (${m1} × ${v1}) ÷ (${m1} + ${m2})`],
    };
  },
});

export const pendulumPeriodGen = defineGenerator({
  id: 'pendulum-period',
  topic: 'pendulum',
  world: 'intermediate',
  difficulty: 2,
  params: (rng) => ({ L: rng.pick([0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 4]) }),
  build: ({ L }) => {
    const T = P.pendulumPeriod(L, G_STD);
    return {
      type: 'numeric',
      prompt: `What is the period of a simple pendulum ${num(L)} m long? Use g = 9.8 m/s².`,
      answer: T,
      unit: 's',
      decimals: 2,
      explanation: `T = 2π√(L/g) = 2π√(${num(L)} ÷ 9.8) = ${fmt(T)} s.`,
      hints: ['Only the length and gravity matter — not the mass.', 'T = 2π√(L/g)', `T = 2π × √(${num(L)} ÷ 9.8)`],
    };
  },
});

export const archimedes = defineGenerator({
  id: 'archimedes',
  topic: 'buoyancy',
  world: 'intermediate',
  difficulty: 2,
  params: (rng) => ({
    ask: rng.pick(['force', 'apparent'] as const),
    fluid: rng.pick([
      { name: 'fresh water', rho: 1000 },
      { name: 'sea water', rho: 1025 },
    ]),
    volumeL: rng.int(2, 40),
    density: rng.pick([2700, 7800, 8900]),
  }),
  build: ({ ask, fluid, volumeL, density }) => {
    const V = volumeL / 1000;
    const fb = P.buoyancy(fluid.rho, V, G_STD);
    if (ask === 'apparent') {
      const m = density * V;
      const fbWater = P.buoyancy(1000, V, G_STD);
      const apparent = P.weight(m, G_STD) - fbWater;
      return {
        type: 'numeric',
        prompt: `A metal block (density ${num(density)} kg/m³, volume ${num(V)} m³) hangs from a spring scale, fully under fresh water (1000 kg/m³). What does the scale read? Use g = 9.8 m/s².`,
        answer: apparent,
        unit: 'N',
        decimals: 1,
        explanation: `Weight = ρ_metal V g = ${num(m)} × 9.8 = ${fmt(P.weight(m, G_STD), 1)} N. Buoyant force = 1000 × ${num(V)} × 9.8 = ${fmt(fbWater, 1)} N. Scale reading = ${fmt(apparent, 1)} N.`,
        hints: ['The water pushes up, so the scale reads less than the block’s weight.', 'reading = weight − buoyant force = ρ_metal V g − ρ_water V g', `weight = ${num(density)} × ${num(V)} × 9.8`],
      };
    }
    return {
      type: 'numeric',
      prompt: `A sealed drum of volume ${num(V)} m³ is fully submerged in ${fluid.name} (density ${fluid.rho} kg/m³). What is the buoyant force? Use g = 9.8 m/s².`,
      answer: fb,
      unit: 'N',
      decimals: 1,
      explanation: `F_b = ρ V g = ${fluid.rho} × ${num(V)} × 9.8 = ${fmt(fb, 1)} N.`,
      hints: ['The buoyant force equals the weight of the displaced fluid.', 'F_b = ρ_fluid × V × g', `F_b = ${fluid.rho} × ${num(V)} × 9.8`],
    };
  },
});

// ============================================================ Advanced =====

export const projectile = defineGenerator({
  id: 'projectile',
  topic: 'projectiles',
  world: 'advanced',
  difficulty: 3,
  params: (rng) => ({ v: rng.int(10, 30), theta: rng.pick([15, 30, 45, 60, 75]), ask: rng.pick(['range', 'height', 'time'] as const) }),
  build: ({ v, theta, ask }) => {
    if (ask === 'height') {
      const h = P.maxHeightProjectile(v, theta, G_STD);
      return {
        type: 'numeric',
        prompt: `A ball is launched at ${v} m/s, ${theta}° above level ground. Ignoring air resistance (g = 9.8 m/s²), how high does it rise?`,
        answer: h,
        unit: 'm',
        decimals: 1,
        explanation: `H = (v sinθ)² ÷ 2g = (${v} × sin ${theta}°)² ÷ 19.6 = ${fmt(h, 1)} m.`,
        hints: ['Only the vertical part of the velocity lifts the ball.', 'H = v² sin²θ ÷ (2g)', `v_y = ${v} × sin ${theta}° = ${fmt(v * Math.sin((theta * Math.PI) / 180))} m/s`],
      };
    }
    if (ask === 'time') {
      const t = P.timeOfFlightProjectile(v, theta, G_STD);
      return {
        type: 'numeric',
        prompt: `A ball is launched at ${v} m/s, ${theta}° above level ground. Ignoring air resistance (g = 9.8 m/s²), how long is it in the air?`,
        answer: t,
        unit: 's',
        decimals: 2,
        explanation: `t = 2 v sinθ ÷ g = 2 × ${v} × sin ${theta}° ÷ 9.8 = ${fmt(t)} s.`,
        hints: ['The flight lasts until the vertical velocity has reversed.', 't = 2 v sinθ ÷ g', `v_y = ${v} × sin ${theta}° = ${fmt(v * Math.sin((theta * Math.PI) / 180))} m/s`],
      };
    }
    const R = P.rangeProjectile(v, theta, G_STD);
    return {
      type: 'numeric',
      prompt: `A cannon fires a ball at ${v} m/s, ${theta}° above level ground. Ignoring air resistance (g = 9.8 m/s²), how far away does it land?`,
      answer: R,
      unit: 'm',
      decimals: 1,
      explanation: `R = v² sin(2θ) ÷ g = ${v}² × sin ${2 * theta}° ÷ 9.8 = ${fmt(R, 1)} m.`,
      hints: ['Range depends on both speed and angle; 45° gives the maximum on level ground.', 'R = v² sin(2θ) ÷ g', `R = ${v * v} × sin ${2 * theta}° ÷ 9.8`],
    };
  },
});

export const orbitalVelocityGen = defineGenerator({
  id: 'orbital-velocity',
  topic: 'orbits',
  world: 'advanced',
  difficulty: 3,
  params: (rng) => ({
    orbit: rng.pick([
      { name: 'the International Space Station', h: 420 },
      { name: 'an Earth-observation satellite', h: 800 },
      { name: 'a satellite', h: 2000 },
      { name: 'a GPS satellite', h: 20200 },
      { name: 'a geostationary satellite', h: 35786 },
    ]),
    ask: rng.pick(['speed', 'period'] as const),
  }),
  build: ({ orbit, ask }) => {
    const r = (R_EARTH_KM + orbit.h) * 1000;
    const given = `Earth's mass is 5.972 × 10²⁴ kg, its radius 6,371 km, and G = 6.674 × 10⁻¹¹ N·m²/kg².`;
    if (ask === 'period') {
      const T = P.keplerPeriod(r, M_EARTH) / 3600;
      return {
        type: 'numeric',
        prompt: `${capitalize(orbit.name)} orbits ${num(orbit.h)} km above Earth's surface. What is its orbital period in hours? ${given}`,
        answer: T,
        unit: 'h',
        decimals: 1,
        explanation: `r = ${num(R_EARTH_KM)} + ${num(orbit.h)} = ${num(R_EARTH_KM + orbit.h)} km. T = 2π√(r³/GM) = ${fmt(T * 3600, 0)} s = ${fmt(T, 1)} h.`,
        hints: ['Measure the orbit radius from Earth’s centre, not its surface.', 'T = 2π √(r³ ÷ GM)', `r = ${num(R_EARTH_KM + orbit.h)} km = ${num(r)} m`],
      };
    }
    const v = P.orbitalVelocity(M_EARTH, r) / 1000;
    return {
      type: 'numeric',
      prompt: `${capitalize(orbit.name)} orbits ${num(orbit.h)} km above Earth's surface. What is its orbital speed in km/s? ${given}`,
      answer: v,
      unit: 'km/s',
      decimals: 2,
      explanation: `r = ${num(R_EARTH_KM + orbit.h)} km. v = √(GM/r) = ${fmt(v)} km/s.`,
      hints: ['Gravity provides exactly the centripetal force needed for a circular orbit.', 'v = √(GM ÷ r), with r measured from Earth’s centre', `r = ${num(R_EARTH_KM)} km + ${num(orbit.h)} km = ${num(r)} m`],
    };
  },
});

export const carnot = defineGenerator({
  id: 'carnot',
  topic: 'heat-engines',
  world: 'advanced',
  difficulty: 3,
  params: (rng) => ({
    celsius: rng.next() < 0.5,
    Th: rng.int(8, 16) * 50,
    Tc: rng.int(25, 35) * 10,
    ThC: rng.pick([127, 227, 327, 527]),
    TcC: rng.pick([7, 27, 47]),
  }),
  build: ({ celsius, Th, Tc, ThC, TcC }) => {
    if (celsius) {
      const th = celsiusToKelvin(ThC);
      const tc = celsiusToKelvin(TcC);
      const eta = P.carnotEfficiency(tc, th) * 100;
      return {
        type: 'numeric',
        prompt: `A heat engine runs between a boiler at ${ThC} °C and a condenser at ${TcC} °C. What is its maximum (Carnot) efficiency, in percent?`,
        answer: eta,
        unit: '%',
        decimals: 1,
        explanation: `Convert to kelvin: T_h = ${num(th)} K, T_c = ${num(tc)} K. η = 1 − T_c/T_h = 1 − ${num(tc)}/${num(th)} = ${fmt(eta, 1)}%.`,
        hints: ['Careful — the Carnot formula only works with absolute temperatures.', 'η = 1 − T_c ÷ T_h, with T in kelvin (K = °C + 273.15)', `T_h = ${ThC} + 273.15 = ${num(th)} K`],
      };
    }
    const eta = P.carnotEfficiency(Tc, Th) * 100;
    return {
      type: 'numeric',
      prompt: `An ideal engine takes heat from a reservoir at ${Th} K and dumps waste heat at ${Tc} K. What is its maximum (Carnot) efficiency, in percent?`,
      answer: eta,
      unit: '%',
      decimals: 1,
      explanation: `η = 1 − T_c/T_h = 1 − ${Tc}/${Th} = ${fmt(eta, 1)}%.`,
      hints: ['The bigger the temperature gap, the more efficient the engine can be.', 'η = 1 − T_c ÷ T_h', `η = 1 − ${Tc} ÷ ${Th}`],
    };
  },
});

export const faraday = defineGenerator({
  id: 'faraday',
  topic: 'induction',
  world: 'advanced',
  difficulty: 3,
  params: (rng) => ({
    N: rng.pick([50, 100, 200, 500]),
    areaCm2: rng.pick([10, 20, 50, 100]),
    dB: rng.int(1, 8) / 10,
    dt: rng.pick([0.05, 0.1, 0.2, 0.5]),
  }),
  build: ({ N, areaCm2, dB, dt }) => {
    const A = areaCm2 / 10_000;
    const dPhi = dB * A;
    const emf = Math.abs(P.faradayEmf(N, dPhi, dt));
    return {
      type: 'numeric',
      prompt: `A coil of ${N} turns, each with area ${areaCm2} cm², sits in a magnetic field that increases by ${num(dB)} T in ${num(dt)} s. What is the size of the induced EMF?`,
      answer: emf,
      unit: 'V',
      decimals: 2,
      explanation: `ΔΦ = ΔB × A = ${num(dB)} × ${num(A)} = ${num(dPhi, 6)} Wb per turn. |ε| = N ΔΦ/Δt = ${N} × ${num(dPhi, 6)} ÷ ${num(dt)} = ${fmt(emf)} V.`,
      hints: ['Only a changing magnetic flux induces a voltage.', '|ε| = N × ΔΦ ÷ Δt, with ΔΦ = ΔB × A (A in m²)', `A = ${areaCm2} cm² = ${num(A)} m²`],
    };
  },
});

export const springPeriodGen = defineGenerator({
  id: 'spring-period',
  topic: 'springs',
  world: 'advanced',
  difficulty: 2,
  params: (rng) => ({ m: rng.pick([0.1, 0.2, 0.25, 0.5, 1, 1.5, 2]), k: rng.pick([10, 20, 40, 50, 100, 200]), ask: rng.pick(['T', 'f'] as const) }),
  build: ({ m, k, ask }) => {
    const T = P.springPeriod(m, k);
    if (ask === 'f') {
      const f = P.freqFromPeriod(T);
      return {
        type: 'numeric',
        prompt: `A ${num(m)} kg mass bounces on a spring with spring constant ${k} N/m. What is its oscillation frequency?`,
        answer: f,
        unit: 'Hz',
        decimals: 2,
        explanation: `T = 2π√(m/k) = ${fmt(T, 3)} s, so f = 1/T = ${fmt(f)} Hz.`,
        hints: ['Find the period first, then invert it.', 'T = 2π√(m ÷ k), f = 1 ÷ T', `T = 2π × √(${num(m)} ÷ ${k})`],
      };
    }
    return {
      type: 'numeric',
      prompt: `A ${num(m)} kg mass bounces on a spring with spring constant ${k} N/m. What is the period of oscillation?`,
      answer: T,
      unit: 's',
      decimals: 2,
      explanation: `T = 2π√(m/k) = 2π√(${num(m)} ÷ ${k}) = ${fmt(T)} s.`,
      hints: ['A heavier mass or a softer spring means slower oscillations.', 'T = 2π √(m ÷ k)', `T = 2π × √(${num(m)} ÷ ${k})`],
    };
  },
});

export const bernoulliGen = defineGenerator({
  id: 'bernoulli',
  topic: 'fluids',
  world: 'advanced',
  difficulty: 3,
  params: (rng) => ({ v1: rng.int(1, 3), v2: rng.int(4, 8) }),
  build: ({ v1, v2 }) => {
    const rho = 1000;
    const P1 = 200_000;
    const total = P.bernoulli(P1, v1, 0, rho).P2factor; // P + ½ρv² + ρgh at point 1
    const P2 = total - 0.5 * rho * v2 * v2;
    const dropKPa = (P1 - P2) / 1000;
    return {
      type: 'numeric',
      prompt: `Water (density 1000 kg/m³) flows through a horizontal pipe. In the wide section it moves at ${v1} m/s; in the narrow section at ${v2} m/s. By how many kPa is the pressure lower in the narrow section?`,
      answer: dropKPa,
      unit: 'kPa',
      decimals: 2,
      explanation: `For a horizontal pipe, P₁ − P₂ = ½ρ(v₂² − v₁²) = ½ × 1000 × (${v2 * v2} − ${v1 * v1}) = ${num(P1 - P2)} Pa = ${fmt(dropKPa)} kPa.`,
      hints: ['Where the fluid moves faster, its pressure is lower.', 'P₁ + ½ρv₁² = P₂ + ½ρv₂² (same height), so ΔP = ½ρ(v₂² − v₁²)', `ΔP = ½ × 1000 × (${v2}² − ${v1}²)`],
    };
  },
});

export const dopplerGen = defineGenerator({
  id: 'doppler',
  topic: 'doppler',
  world: 'advanced',
  difficulty: 3,
  params: (rng) => ({ f0: rng.int(6, 20) * 50, vs: rng.int(2, 12) * 5, approaching: rng.next() < 0.5 }),
  build: ({ f0, vs, approaching }) => {
    const f = P.dopplerShift(f0, approaching ? vs : -vs, 0, V_SOUND);
    const dir = approaching ? 'towards' : 'away from';
    return {
      type: 'numeric',
      prompt: `An ambulance siren emits ${f0} Hz while driving at ${vs} m/s ${dir} a person standing still. What frequency does the person hear? (Speed of sound: ${V_SOUND} m/s.)`,
      answer: f,
      unit: 'Hz',
      decimals: 0,
      tolerance: 0.005,
      explanation: `f' = f v ÷ (v ${approaching ? '−' : '+'} v_s) = ${f0} × ${V_SOUND} ÷ ${approaching ? V_SOUND - vs : V_SOUND + vs} = ${fmt(f, 0)} Hz — ${approaching ? 'higher' : 'lower'} than emitted.`,
      hints: [
        'A source moving towards you squeezes the waves together (higher pitch); moving away stretches them.',
        "f' = f × v ÷ (v − v_s) when approaching, f × v ÷ (v + v_s) when receding",
        `f' = ${f0} × ${V_SOUND} ÷ (${V_SOUND} ${approaching ? '−' : '+'} ${vs})`,
      ],
    };
  },
});

// ============================================================== Expert =====

export const timeDilationGen = defineGenerator({
  id: 'time-dilation',
  topic: 'relativity',
  world: 'expert',
  difficulty: 3,
  params: (rng) => ({ beta: rng.pick([0.6, 0.8, 0.9, 0.96, 0.99]), t0: rng.int(1, 20), ask: rng.pick(['time', 'length', 'gamma'] as const) }),
  build: ({ beta, t0, ask }) => {
    const v = beta * P.C;
    const gamma = P.lorentzFactor(v);
    if (ask === 'gamma') {
      return {
        type: 'numeric',
        prompt: `What is the Lorentz factor γ for a spaceship moving at ${num(beta)}c?`,
        answer: gamma,
        decimals: 3,
        explanation: `γ = 1 ÷ √(1 − v²/c²) = 1 ÷ √(1 − ${num(beta)}²) = ${fmt(gamma, 3)}.`,
        hints: ['γ is 1 at rest and grows without limit as v approaches c.', 'γ = 1 ÷ √(1 − β²), where β = v/c', `1 − ${num(beta)}² = ${num(1 - beta * beta, 4)}`],
      };
    }
    if (ask === 'length') {
      const L = P.lengthContraction(t0 * 10, v);
      return {
        type: 'numeric',
        prompt: `A spaceship is ${t0 * 10} m long when at rest. How long does it measure for an observer it passes at ${num(beta)}c?`,
        answer: L,
        unit: 'm',
        decimals: 2,
        explanation: `γ = ${fmt(gamma, 3)}, so L = L₀ ÷ γ = ${t0 * 10} ÷ ${fmt(gamma, 3)} = ${fmt(L)} m.`,
        hints: ['Moving objects are shortened along their direction of motion.', 'L = L₀ ÷ γ, with γ = 1 ÷ √(1 − β²)', `γ = 1 ÷ √(1 − ${num(beta)}²) = ${fmt(gamma, 3)}`],
      };
    }
    const t = P.timeDilation(t0, v);
    return {
      type: 'numeric',
      prompt: `An astronaut's clock records ${t0} hours of travel while her ship moves at ${num(beta)}c relative to Earth. How many hours pass for Earth observers?`,
      answer: t,
      unit: 'h',
      decimals: 2,
      explanation: `γ = 1 ÷ √(1 − ${num(beta)}²) = ${fmt(gamma, 3)}, so Δt = γ Δt₀ = ${fmt(gamma, 3)} × ${t0} = ${fmt(t)} h.`,
      hints: ['The astronaut’s own clock measures the proper time, which is the shortest.', 'Δt = γ Δt₀, with γ = 1 ÷ √(1 − β²)', `γ = 1 ÷ √(1 − ${num(beta)}²) = ${fmt(gamma, 3)}`],
    };
  },
});

const METALS = [
  { name: 'sodium', phi: 2.28 },
  { name: 'potassium', phi: 2.3 },
  { name: 'calcium', phi: 2.87 },
  { name: 'zinc', phi: 4.33 },
  { name: 'copper', phi: 4.7 },
] as const;

export const photoelectric = defineGenerator({
  id: 'photoelectric',
  topic: 'photoelectric',
  world: 'expert',
  difficulty: 3,
  params: (rng) => {
    const metal = rng.pick(METALS);
    const candidates = [150, 200, 250, 300, 350, 400, 450].filter(
      (nm) => P.photonEnergyFromWavelength(nm * 1e-9) / P.E_CHARGE - metal.phi >= 0.3,
    );
    return { metal, nm: rng.pick(candidates), ask: rng.pick(['ke', 'threshold'] as const) };
  },
  build: ({ metal, nm, ask }) => {
    if (ask === 'threshold') {
      const lambda0 = ((P.H * P.C) / (metal.phi * P.E_CHARGE)) * 1e9;
      return {
        type: 'numeric',
        prompt: `The work function of ${metal.name} is ${metal.phi} eV. What is the longest wavelength of light (in nm) that can eject electrons from it? (h = 6.626 × 10⁻³⁴ J·s, c = 3.00 × 10⁸ m/s, 1 eV = 1.602 × 10⁻¹⁹ J.)`,
        answer: lambda0,
        unit: 'nm',
        decimals: 0,
        explanation: `At threshold hc/λ₀ = φ, so λ₀ = hc ÷ φ = (6.626 × 10⁻³⁴ × 3.00 × 10⁸) ÷ (${metal.phi} × 1.602 × 10⁻¹⁹) = ${fmt(lambda0, 0)} nm.`,
        hints: ['At the threshold, the photon has just enough energy to free an electron.', 'hc ÷ λ₀ = φ, so λ₀ = hc ÷ φ (φ in joules)', `φ = ${metal.phi} × 1.602 × 10⁻¹⁹ J`],
      };
    }
    const Ephoton = P.photonEnergyFromWavelength(nm * 1e-9) / P.E_CHARGE;
    const ke = P.photoelectricKE(Ephoton, metal.phi);
    return {
      type: 'numeric',
      prompt: `Light of wavelength ${nm} nm shines on ${metal.name} (work function ${metal.phi} eV). What is the maximum kinetic energy of the ejected electrons, in eV? (hc ≈ 1240 eV·nm.)`,
      answer: ke,
      unit: 'eV',
      decimals: 2,
      explanation: `Photon energy E = hc/λ = 1240 ÷ ${nm} ≈ ${fmt(Ephoton)} eV. KE_max = E − φ = ${fmt(Ephoton)} − ${metal.phi} = ${fmt(ke)} eV.`,
      hints: ['Each photon gives all its energy to one electron; the work function is the cost of escaping.', 'KE_max = hc/λ − φ', `E_photon = 1240 eV·nm ÷ ${nm} nm`],
    };
  },
});

export const tunneling = defineGenerator({
  id: 'tunneling',
  topic: 'tunneling',
  world: 'expert',
  difficulty: 3,
  params: (rng) => {
    const combos = [
      [0.5, 2],
      [0.5, 3],
      [0.2, 2],
      [0.2, 3],
      [0.1, 2],
      [0.1, 3],
      [0.05, 2],
    ] as const;
    const [T0, n] = rng.pick(combos);
    return { T0, n };
  },
  build: ({ T0, n }) => {
    // T ≈ e^(−2κL): with κL fixed by T0, widening the barrier n times gives T0^n.
    const kappaL = -Math.log(T0) / 2;
    const T = P.tunnelingTransmission(kappaL, n) * 100;
    return {
      type: 'numeric',
      prompt: `An electron has a ${num(T0 * 100)}% chance of tunnelling through a thin barrier. If the barrier is made ${n} times wider (same height), what is the new tunnelling probability, in percent? Use T ≈ e^(−2κL).`,
      answer: T,
      unit: '%',
      decimals: 2,
      explanation: `T ∝ e^(−2κL), so making L ${n}× larger raises T to the power ${n}: (${num(T0)})^${n} = ${num(T / 100, 6)} = ${fmt(T)}%.`,
      hints: ['Tunnelling probability falls off exponentially with barrier width.', `T = e^(−2κL), so e^(−2κ·${n}L) = (e^(−2κL))^${n}`, `New T = (${num(T0)})^${n}`],
    };
  },
});

export const halfLife = defineGenerator({
  id: 'half-life',
  topic: 'nuclear-decay',
  world: 'expert',
  difficulty: 2,
  params: (rng) => ({
    N0: rng.pick([800, 1600, 3200, 6400, 10000]),
    T: rng.pick([2, 5, 8, 12]),
    unit: rng.pick(['hours', 'days', 'years']),
    n: rng.int(1, 4),
    ask: rng.pick(['remaining', 'lambda'] as const),
  }),
  build: ({ N0, T, unit, n, ask }) => {
    if (ask === 'lambda') {
      const lambda = P.decayConstantFromHalfLife(T);
      const u = unit.slice(0, -1);
      return {
        type: 'numeric',
        prompt: `A radioactive isotope has a half-life of ${T} ${unit}. What is its decay constant λ, in per ${u}?`,
        answer: lambda,
        unit: `${u}⁻¹`,
        decimals: 3,
        explanation: `λ = ln 2 ÷ T½ = 0.693 ÷ ${T} = ${fmt(lambda, 3)} per ${u}.`,
        hints: ['A shorter half-life means a larger decay constant.', 'λ = ln 2 ÷ T½', `λ = 0.693 ÷ ${T}`],
      };
    }
    const t = n * T;
    const remaining = P.remainingAfterHalfLives(N0, n);
    return {
      type: 'numeric',
      prompt: `A sample contains ${num(N0)} radioactive nuclei with a half-life of ${T} ${unit}. How many remain undecayed after ${t} ${unit}?`,
      answer: remaining,
      decimals: 0,
      explanation: `${t} ${unit} is ${n} half-li${n === 1 ? 'fe' : 'ves'}, so N = ${num(N0)} × (½)^${n} = ${num(remaining)}.`,
      hints: ['Work out how many half-lives fit into the time.', 'N = N₀ × (½)^(t ÷ T½)', `t ÷ T½ = ${t} ÷ ${T} = ${n}`],
    };
  },
});

export const rlcResonance = defineGenerator({
  id: 'rlc-resonance',
  topic: 'resonance',
  world: 'expert',
  difficulty: 3,
  params: (rng) => ({ LmH: rng.pick([1, 2, 5, 10, 20, 50]), CuF: rng.pick([1, 2, 4.7, 10, 22, 47, 100]) }),
  build: ({ LmH, CuF }) => {
    const f0 = P.resonantFrequency(LmH / 1000, CuF / 1e6);
    return {
      type: 'numeric',
      prompt: `A series RLC circuit has L = ${LmH} mH and C = ${num(CuF)} µF. At what frequency does it resonate?`,
      answer: f0,
      unit: 'Hz',
      decimals: 0,
      tolerance: 0.005,
      explanation: `f₀ = 1 ÷ (2π√(LC)) = 1 ÷ (2π√(${num(LmH / 1000)} × ${num(CuF / 1e6, 8)})) = ${fmt(f0, 0)} Hz.`,
      hints: ['At resonance the inductive and capacitive reactances cancel.', 'f₀ = 1 ÷ (2π √(L C)), with L in henries and C in farads', `L = ${num(LmH / 1000)} H, C = ${num(CuF / 1e6, 8)} F`],
    };
  },
});

export const hubble = defineGenerator({
  id: 'hubble',
  topic: 'cosmology',
  world: 'expert',
  difficulty: 2,
  params: (rng) => ({ d: rng.int(1, 50) * 10, ask: rng.pick(['v', 'd'] as const) }),
  build: ({ d, ask }) => {
    const v = P.hubbleVelocity(H0, d);
    if (ask === 'd') {
      return {
        type: 'numeric',
        prompt: `A galaxy is receding at ${num(v)} km/s. Using H₀ = ${H0} km/s/Mpc, how far away is it, in megaparsecs?`,
        answer: d,
        unit: 'Mpc',
        decimals: 0,
        explanation: `d = v ÷ H₀ = ${num(v)} ÷ ${H0} = ${num(d)} Mpc.`,
        hints: ['More distant galaxies recede faster.', 'v = H₀ d, so d = v ÷ H₀', `d = ${num(v)} ÷ ${H0}`],
      };
    }
    return {
      type: 'numeric',
      prompt: `A galaxy is ${num(d)} Mpc away. Using H₀ = ${H0} km/s/Mpc, how fast is it receding from us, in km/s?`,
      answer: v,
      unit: 'km/s',
      decimals: 0,
      explanation: `v = H₀ d = ${H0} × ${num(d)} = ${num(v)} km/s.`,
      hints: ['Space itself is expanding, so distant galaxies move away faster.', 'v = H₀ × d', `v = ${H0} × ${num(d)}`],
    };
  },
});

export const entropyGen = defineGenerator({
  id: 'entropy',
  topic: 'entropy',
  world: 'expert',
  difficulty: 3,
  params: (rng) => ({
    ask: rng.pick(['melt', 'reservoir'] as const),
    m: rng.pick([0.1, 0.25, 0.5, 1, 2]),
    QkJ: rng.int(1, 20) * 50,
    T: rng.int(25, 60) * 10,
  }),
  build: ({ ask, m, QkJ, T }) => {
    if (ask === 'reservoir') {
      const dS = P.entropyChange(QkJ * 1000, T);
      return {
        type: 'numeric',
        prompt: `${num(QkJ)} kJ of heat flows into a large reservoir held at ${T} K. What is the reservoir's entropy change, in J/K?`,
        answer: dS,
        unit: 'J/K',
        decimals: 1,
        explanation: `ΔS = Q ÷ T = ${num(QkJ * 1000)} ÷ ${T} = ${fmt(dS, 1)} J/K.`,
        hints: ['Adding heat at constant temperature increases entropy.', 'ΔS = Q ÷ T (Q in joules, T in kelvin)', `ΔS = ${num(QkJ * 1000)} J ÷ ${T} K`],
      };
    }
    const Q = m * L_FUSION_ICE;
    const dS = P.entropyChange(Q, 273.15);
    return {
      type: 'numeric',
      prompt: `${num(m)} kg of ice melts at 0 °C (273.15 K). The latent heat of fusion of ice is 334 kJ/kg. What is the entropy change of the ice, in J/K?`,
      answer: dS,
      unit: 'J/K',
      decimals: 0,
      tolerance: 0.005,
      explanation: `Q = m L = ${num(m)} × 334,000 = ${num(Q)} J. ΔS = Q ÷ T = ${num(Q)} ÷ 273.15 = ${fmt(dS, 0)} J/K.`,
      hints: ['Melting happens at constant temperature, so ΔS = Q/T applies directly.', 'Q = m × L, then ΔS = Q ÷ T', `Q = ${num(m)} kg × 334,000 J/kg = ${num(Q)} J`],
    };
  },
});

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const GENERATORS: AnyQuestionGenerator[] = [
  speedBasic,
  freeFallBasic,
  netForceBasic,
  rampEnergy,
  buoyancyBasic,
  pendulumRatio,
  circuitCurrent,
  newtonSecondLaw,
  ohmLaw,
  seriesParallel,
  waveSpeedGen,
  thinLens,
  momentumGen,
  pendulumPeriodGen,
  archimedes,
  projectile,
  orbitalVelocityGen,
  carnot,
  faraday,
  springPeriodGen,
  bernoulliGen,
  dopplerGen,
  timeDilationGen,
  photoelectric,
  tunneling,
  halfLife,
  rlcResonance,
  hubble,
  entropyGen,
];

const BY_ID = new Map(GENERATORS.map((g) => [g.id, g]));

export function getGenerator(id: string): AnyQuestionGenerator | undefined {
  return BY_ID.get(id);
}
