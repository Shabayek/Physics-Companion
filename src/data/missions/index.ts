import type { Mission } from '../../types';
import { BEGINNER_MISSIONS } from './beginner';
import { INTERMEDIATE_MISSIONS } from './intermediate';
import { ADVANCED_MISSIONS } from './advanced';
import { EXPERT_MISSIONS } from './expert';

export { BEGINNER_MISSIONS, INTERMEDIATE_MISSIONS, ADVANCED_MISSIONS, EXPERT_MISSIONS };

export const ALL_MISSIONS: Mission[] = [...BEGINNER_MISSIONS, ...INTERMEDIATE_MISSIONS, ...ADVANCED_MISSIONS, ...EXPERT_MISSIONS];

export function missionsByWorld(world: string): Mission[] {
  return ALL_MISSIONS.filter((m) => m.world === world);
}

export function getMission(id: string): Mission | undefined {
  return ALL_MISSIONS.find((m) => m.id === id);
}
