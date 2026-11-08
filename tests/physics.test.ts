import { describe, it, expect } from 'vitest';
import * as P from '../src/game/engine/physics';

describe('physics engine', () => {
  it('kinematics', () => {
    expect(P.velocity(0, 2, 3)).toBe(6);
    expect(P.displacement(0, 2, 3)).toBe(9);
    expect(P.rangeProjectile(20, 45)).toBeCloseTo(40.77, 1);
  });
  it('dynamics', () => {
    expect(P.acceleration(10, 5)).toBe(2);
    expect(P.newtonSecond(5, 2)).toBe(10);
  });
  it('energy', () => {
    expect(P.kineticEnergy(2, 3)).toBe(9);
    expect(P.potentialEnergy(2, 9.8, 5)).toBeCloseTo(98, 0);
  });
  it('electricity', () => {
    expect(P.ohmCurrent(12, 4)).toBe(3);
    expect(P.seriesResistance([1, 2, 3])).toBe(6);
    expect(P.parallelResistance([2, 2])).toBe(1);
  });
  it('waves/optics', () => {
    expect(P.waveSpeed(2, 3)).toBe(6);
    expect(P.snell(1, 30, 1.5)).toBeCloseTo(19.47, 1);
  });
  it('thermo', () => {
    expect(P.idealGasPressure(1, 0.024, 300)).toBeCloseTo(103925, -2);
    expect(P.carnotEfficiency(300, 600)).toBeCloseTo(0.5, 5);
  });
  it('relativity', () => {
    expect(P.lorentzFactor(0)).toBe(1);
    expect(P.massEnergy(1)).toBeGreaterThan(8e16);
  });
  it('quantum', () => {
    expect(P.photonEnergy(1e14)).toBeCloseTo(6.626e-20, 1e-22);
  });
  it('nuclear', () => {
    const lam = P.decayConstantFromHalfLife(10);
    expect(P.decayAmount(100, lam, 10)).toBeCloseTo(50, 5);
  });
  it('units', () => {
    expect(P.convertPrefix(1, 'k', 'm')).toBe(1e6);
  });
});
