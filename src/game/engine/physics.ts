// Pure physics helper functions. All inputs/outputs are plain data. SI units unless noted.

export const G = 6.6743e-11; // m^3 kg^-1 s^-2
export const C = 299792458; // m/s
export const H = 6.62607015e-34; // J s
export const HBAR = 1.054571817e-34; // J s
export const K_B = 1.380649e-23; // J/K
export const R_GAS = 8.314462618; // J/(mol K)
export const N_A = 6.02214076e23; // mol^-1
export const E_CHARGE = 1.602176634e-19; // C
export const M_E = 9.10938356e-31; // kg
export const M_P = 1.67262192369e-27; // kg
export const MU0 = 4 * Math.PI * 1e-7; // N/A^2
export const EPS0 = 8.8541878128e-12; // F/m
export const G_EARTH = 9.80665; // m/s^2

// ---------- Kinematics ----------
export function velocity(u: number, a: number, t: number): number {
  return u + a * t;
}
export function displacement(u: number, a: number, t: number): number {
  return u * t + 0.5 * a * t * t;
}
export function vSquared(u: number, a: number, s: number): number {
  return u * u + 2 * a * s;
}
export function timeOfFlightProjectile(v0: number, thetaDeg: number, g = G_EARTH): number {
  const theta = (thetaDeg * Math.PI) / 180;
  return (2 * v0 * Math.sin(theta)) / g;
}
export function rangeProjectile(v0: number, thetaDeg: number, g = G_EARTH): number {
  const theta = (thetaDeg * Math.PI) / 180;
  return (v0 * v0 * Math.sin(2 * theta)) / g;
}
export function maxHeightProjectile(v0: number, thetaDeg: number, g = G_EARTH): number {
  const theta = (thetaDeg * Math.PI) / 180;
  return (v0 * v0 * Math.sin(theta) * Math.sin(theta)) / (2 * g);
}

// ---------- Dynamics ----------
export function newtonSecond(m: number, a: number): number {
  return m * a;
}
export function acceleration(F: number, m: number): number {
  if (m === 0) return 0;
  return F / m;
}
export function weight(m: number, g = G_EARTH): number {
  return m * g;
}
export function friction(mu: number, normal: number): number {
  return mu * normal;
}
export function netForce(forces: number[]): number {
  return forces.reduce((a, b) => a + b, 0);
}

// ---------- Work / Energy ----------
export function work(F: number, d: number, thetaDeg = 0): number {
  const theta = (thetaDeg * Math.PI) / 180;
  return F * d * Math.cos(theta);
}
export function kineticEnergy(m: number, v: number): number {
  return 0.5 * m * v * v;
}
export function potentialEnergy(m: number, g: number, h: number): number {
  return m * g * h;
}
export function power(W: number, t: number): number {
  if (t === 0) return 0;
  return W / t;
}
export function efficiency(useful: number, input: number): number {
  if (input === 0) return 0;
  return useful / input;
}

// ---------- Momentum ----------
export function momentum(m: number, v: number): number {
  return m * v;
}
export function impulse(F: number, dt: number): number {
  return F * dt;
}
export interface CollisionResult {
  v1f: number;
  v2f: number;
}
export function elasticCollision(m1: number, v1i: number, m2: number, v2i: number): CollisionResult {
  const v1f = ((m1 - m2) * v1i + 2 * m2 * v2i) / (m1 + m2);
  const v2f = ((m2 - m1) * v2i + 2 * m1 * v1i) / (m1 + m2);
  return { v1f, v2f };
}
export function inelasticCollision(m1: number, v1i: number, m2: number, v2i: number): CollisionResult {
  const vf = (m1 * v1i + m2 * v2i) / (m1 + m2);
  return { v1f: vf, v2f: vf };
}

// ---------- Waves ----------
export function waveSpeed(f: number, lambda: number): number {
  return f * lambda;
}
export function periodFromFreq(f: number): number {
  if (f === 0) return 0;
  return 1 / f;
}
export function freqFromPeriod(t: number): number {
  if (t === 0) return 0;
  return 1 / t;
}
export function dopplerShift(f0: number, vSource: number, vObserver: number, vWave: number): number {
  // f' = f0 * (v + vo)/(v - vs)  (sign convention: positive toward)
  const denom = vWave - vSource;
  if (denom === 0) return Infinity;
  return f0 * (vWave + vObserver) / denom;
}

// ---------- Electricity ----------
export function ohmVoltage(I: number, R: number): number {
  return I * R;
}
export function ohmCurrent(V: number, R: number): number {
  if (R === 0) return Infinity;
  return V / R;
}
export function ohmResistance(V: number, I: number): number {
  if (I === 0) return Infinity;
  return V / I;
}
export function seriesResistance(rs: number[]): number {
  return rs.reduce((a, b) => a + b, 0);
}
export function parallelResistance(rs: number[]): number {
  const inv = rs.reduce((a, b) => a + (b === 0 ? 0 : 1 / b), 0);
  if (inv === 0) return Infinity;
  return 1 / inv;
}
export function electricalPowerVI(V: number, I: number): number {
  return V * I;
}
export function electricalPowerIR(I: number, R: number): number {
  return I * I * R;
}
export function capacitanceEnergy(C: number, V: number): number {
  return 0.5 * C * V * V;
}

// ---------- Optics ----------
export function lensFormula(f: number, u: number): number {
  // 1/f = 1/u + 1/v  -> v
  if (u === f) return Infinity;
  return (f * u) / (u - f);
}
export function magnification(v: number, u: number): number {
  if (u === 0) return 0;
  return -v / u;
}
export function snell(n1: number, theta1Deg: number, n2: number): number {
  const theta1 = (theta1Deg * Math.PI) / 180;
  const sin2 = (n1 / n2) * Math.sin(theta1);
  if (sin2 > 1 || sin2 < -1) return NaN; // TIR
  return (Math.asin(sin2) * 180) / Math.PI;
}
export function criticalAngle(n1: number, n2: number): number {
  if (n1 <= n2) return 90;
  return (Math.asin(n2 / n1) * 180) / Math.PI;
}

// ---------- Gravitation ----------
export function gravitationalForce(m1: number, m2: number, r: number): number {
  if (r === 0) return Infinity;
  return (G * m1 * m2) / (r * r);
}
export function orbitalVelocity(M: number, r: number): number {
  if (r === 0) return 0;
  return Math.sqrt((G * M) / r);
}
export function escapeVelocity(M: number, r: number): number {
  if (r === 0) return 0;
  return Math.sqrt((2 * G * M) / r);
}
export function keplerPeriod(a: number, M: number): number {
  if (M === 0) return 0;
  return 2 * Math.PI * Math.sqrt((a * a * a) / (G * M));
}

// ---------- Thermodynamics ----------
export function heatTransfer(m: number, c: number, dT: number): number {
  return m * c * dT;
}
export function idealGasPressure(n: number, V: number, T: number, R = R_GAS): number {
  if (V === 0) return 0;
  return (n * R * T) / V;
}
export function idealGasVolume(n: number, P: number, T: number, R = R_GAS): number {
  if (P === 0) return 0;
  return (n * R * T) / P;
}
export function carnotEfficiency(Tc: number, Th: number): number {
  if (Th === 0) return 0;
  return 1 - Tc / Th;
}
export function firstLaw(dU: number, Q: number, W: number): boolean {
  // dU = Q - W  (physics sign convention: W done by system)
  return Math.abs(dU - (Q - W)) < 1e-9;
}

// ---------- Oscillations ----------
export function springPeriod(m: number, k: number): number {
  if (k <= 0) return 0;
  return 2 * Math.PI * Math.sqrt(m / k);
}
export function pendulumPeriod(L: number, g = G_EARTH): number {
  if (g <= 0) return 0;
  return 2 * Math.PI * Math.sqrt(L / g);
}
export function shmPosition(A: number, omega: number, t: number, phi = 0): number {
  return A * Math.cos(omega * t + phi);
}
export function shmVelocity(A: number, omega: number, t: number, phi = 0): number {
  return -A * omega * Math.sin(omega * t + phi);
}

// ---------- Fluids ----------
export function buoyancy(rho: number, V: number, g = G_EARTH): number {
  return rho * V * g;
}
export function bernoulli(P1: number, v1: number, h1: number, rho: number, g = G_EARTH): { P2factor: number } {
  // returns dynamic+hydrostatic sum at point1: P1 + 0.5 rho v1^2 + rho g h1 (constant)
  return { P2factor: P1 + 0.5 * rho * v1 * v1 + rho * g * h1 };
}
export function pressure(F: number, A: number): number {
  if (A === 0) return 0;
  return F / A;
}

// ---------- Electromagnetism ----------
export function lorentzForce(q: number, v: number, B: number, thetaDeg = 90): number {
  const theta = (thetaDeg * Math.PI) / 180;
  return q * v * B * Math.sin(theta);
}
export function magneticFieldWire(I: number, r: number): number {
  if (r === 0) return 0;
  return (MU0 * I) / (2 * Math.PI * r);
}
export function faradayEmf(N: number, dPhi: number, dt: number): number {
  if (dt === 0) return 0;
  return -N * (dPhi / dt);
}
export function cyclotronRadius(m: number, v: number, q: number, B: number): number {
  if (q === 0 || B === 0) return 0;
  return (m * v) / (Math.abs(q) * B);
}

// ---------- Relativity ----------
export function lorentzFactor(v: number, c = C): number {
  const beta = v / c;
  if (beta >= 1) return Infinity;
  return 1 / Math.sqrt(1 - beta * beta);
}
export function timeDilation(t0: number, v: number, c = C): number {
  return t0 * lorentzFactor(v, c);
}
export function lengthContraction(L0: number, v: number, c = C): number {
  const g = lorentzFactor(v, c);
  if (!isFinite(g)) return 0;
  return L0 / g;
}
export function massEnergy(m: number, c = C): number {
  return m * c * c;
}
export function relativisticMomentum(m: number, v: number, c = C): number {
  return lorentzFactor(v, c) * m * v;
}

// ---------- Quantum ----------
export function photonEnergy(f: number): number {
  return H * f;
}
export function photonEnergyFromWavelength(lambda: number): number {
  if (lambda === 0) return 0;
  return (H * C) / lambda;
}
export function deBroglieWavelength(m: number, v: number): number {
  if (m * v === 0) return Infinity;
  return H / (m * v);
}
export function photoelectricKE(hf: number, workFunction: number): number {
  return hf - workFunction;
}
export function uncertaintyMin(dx: number): number {
  if (dx === 0) return Infinity;
  return HBAR / (2 * dx);
}

// ---------- Nuclear ----------
export function decayAmount(N0: number, lambda: number, t: number): number {
  return N0 * Math.exp(-lambda * t);
}
export function decayConstantFromHalfLife(T: number): number {
  if (T <= 0) return 0;
  return Math.log(2) / T;
}
export function halfLifeFromDecayConstant(lambda: number): number {
  if (lambda <= 0) return Infinity;
  return Math.log(2) / lambda;
}
export function remainingAfterHalfLives(N0: number, n: number): number {
  return N0 * Math.pow(0.5, n);
}
export function massDefect(massNumbers: number[], actualMass: number): number {
  const sum = massNumbers.reduce((a, b) => a + b, 0);
  return sum - actualMass;
}
export function bindingEnergy(massDefectKg: number): number {
  return massDefectKg * C * C;
}

// ---------- Units ----------
export const SI_PREFIXES: Record<string, number> = {
  y: 1e-24,
  z: 1e-21,
  a: 1e-18,
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  c: 1e-2,
  d: 1e-1,
  da: 1e1,
  h: 1e2,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Z: 1e21,
  Y: 1e24,
};

export function convertPrefix(value: number, from: string, to: string): number {
  const f = SI_PREFIXES[from] ?? 1;
  const t = SI_PREFIXES[to] ?? 1;
  return (value * f) / t;
}

export function approxEqual(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

// ---------- Additions for the question bank ----------
export function averageSpeed(distance: number, time: number): number {
  if (time === 0) return 0;
  return distance / time;
}
/** Resonant frequency of an LC/RLC circuit: f₀ = 1 / (2π√(LC)). */
export function resonantFrequency(L: number, Cap: number): number {
  if (L <= 0 || Cap <= 0) return 0;
  return 1 / (2 * Math.PI * Math.sqrt(L * Cap));
}
/** Hubble's law: recession velocity v = H₀ d (units follow the inputs, e.g. km/s/Mpc × Mpc). */
export function hubbleVelocity(H0: number, d: number): number {
  return H0 * d;
}
/** Entropy change for heat Q exchanged reversibly at constant temperature T: ΔS = Q / T. */
export function entropyChange(Q: number, T: number): number {
  if (T <= 0) return 0;
  return Q / T;
}
/** Approximate transmission through a rectangular barrier: T ≈ e^(−2κL). */
export function tunnelingTransmission(kappa: number, L: number): number {
  return Math.exp(-2 * kappa * L);
}
