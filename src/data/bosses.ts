import type { Boss, Difficulty } from '../types';

/** One boss per world. Beating every boss completes the Codex (all laws and constants). */
export const BOSSES: Boss[] = [
  {
    id: 'boss-beginner',
    world: 'beginner',
    name: 'The Inertia Golem',
    emoji: '🗿',
    lore: 'A mountain of stubborn stone that refuses to change its state of motion. Only a mind that understands forces can move it.',
    stages: [
      { name: 'Rumbling Awake', taunt: 'I stay at rest… unless you can push me!', generatedRatio: 0.2 },
      { name: 'Rolling Rampage', taunt: 'Now I am moving — and I will not stop!', generatedRatio: 0.5 },
      { name: 'Unstoppable Force', taunt: 'Calculate my doom, if you can!', generatedRatio: 0.8 },
    ],
    rewards: {
      quanta: 100,
      badge: 'badge-boss-beginner',
      laws: ['newton1', 'newton2', 'newton3', 'kinematics1', 'kinematics2', 'work', 'ke', 'pe', 'buoyancy', 'pendulum'],
      constants: ['g', 'rho_water', 'rho_air'],
    },
  },
  {
    id: 'boss-intermediate',
    world: 'intermediate',
    name: 'The Circuit Hydra',
    emoji: '🐉',
    lore: 'Every severed head splits into parallel branches of crackling current. Master resistance, waves and light to overload it.',
    stages: [
      { name: 'First Head: Current', taunt: 'Feel the flow of my current!', generatedRatio: 0.3 },
      { name: 'Second Head: Waves', taunt: 'My roar travels at v = f λ!', generatedRatio: 0.5 },
      { name: 'Final Head: Focus', taunt: 'I will bend your light and break your resolve!', generatedRatio: 0.8 },
    ],
    rewards: {
      quanta: 200,
      badge: 'badge-boss-intermediate',
      laws: ['momentum', 'ohm', 'powerElec', 'series', 'parallel', 'wave', 'snell', 'lens'],
      constants: ['e', 'speed_sound', 'lambda_visible', 'f0'],
    },
  },
  {
    id: 'boss-advanced',
    world: 'advanced',
    name: 'The Orbital Leviathan',
    emoji: '🐋',
    lore: 'A colossal beast that swims through spacetime on a perfect orbit, powered by a heat engine at its core.',
    stages: [
      { name: 'Low Orbit', taunt: 'You cannot escape my gravity well.', generatedRatio: 0.4 },
      { name: 'Heat Engine Core', taunt: 'My efficiency approaches Carnot’s limit!', generatedRatio: 0.6 },
      { name: 'Escape Velocity', taunt: 'Only the sharpest calculations reach me now.', generatedRatio: 0.8, minDifficulty: 3 },
    ],
    rewards: {
      quanta: 300,
      badge: 'badge-boss-advanced',
      laws: ['gravitation', 'idealGas', 'carnot', 'spring', 'bernoulli', 'lorentz', 'faraday'],
      constants: ['G', 'k_B', 'R', 'N_A', 'sigma', 'mu0', 'eps0'],
    },
  },
  {
    id: 'boss-expert',
    world: 'expert',
    name: 'The Quantum Sphinx',
    emoji: '🔮',
    lore: 'It exists in a superposition of every riddle at once. Collapse its wavefunction with relativity, quanta and decay.',
    stages: [
      { name: 'Superposition', taunt: 'I am here… and also not here.', generatedRatio: 0.4 },
      { name: 'Time Dilation', taunt: 'For me, your minutes are seconds.', generatedRatio: 0.6 },
      { name: 'Wavefunction Collapse', taunt: 'Answer the final riddle of the universe!', generatedRatio: 0.8, minDifficulty: 3 },
    ],
    rewards: {
      quanta: 500,
      badge: 'badge-boss-expert',
      laws: ['timeDilation', 'massEnergy', 'photon', 'deBroglie', 'decay'],
      constants: ['c', 'h', 'hbar', 'm_e', 'm_p'],
    },
  },
];

export function getBoss(id: string): Boss | undefined {
  return BOSSES.find((b) => b.id === id);
}

export function bossForWorld(world: string): Boss | undefined {
  return BOSSES.find((b) => b.world === (world as Difficulty));
}
