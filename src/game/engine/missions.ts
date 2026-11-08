export type MissionPhase = 'intro' | 'practice' | 'quiz' | 'result';

export interface MissionState {
  phase: MissionPhase;
  stepIndex: number;
  score: number;
  answers: Record<string, unknown>;
}

export function initialMissionState(): MissionState {
  return { phase: 'intro', stepIndex: 0, score: 0, answers: {} };
}

export function nextPhase(state: MissionState): MissionState {
  const order: MissionPhase[] = ['intro', 'practice', 'quiz', 'result'];
  const idx = order.indexOf(state.phase);
  const next = idx < order.length - 1 ? (order[idx + 1] ?? 'result') : 'result';
  return { ...state, phase: next, stepIndex: 0 };
}

export function setAnswer(state: MissionState, key: string, value: unknown): MissionState {
  return { ...state, answers: { ...state.answers, [key]: value } };
}

export function addScore(state: MissionState, delta: number): MissionState {
  return { ...state, score: state.score + delta };
}
