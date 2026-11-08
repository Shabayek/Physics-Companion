// Simulates challenge runs for tests.
import { applyChallengeAnswer, challengePool, startChallenge, type ChallengeInput, type ChallengeMode, type ChallengeState, type ChallengeTiming } from '../../src/game/engine/challenge';
import type { Difficulty, QuizQuestion } from '../../src/types';
import { rightAnswer, wrongAnswer } from './answers';

export interface PlannedChallengeAnswer {
  correct: boolean;
  timeMs?: number;
  hints?: number;
  timedOut?: boolean;
}

export function simulateChallenge(
  mode: ChallengeMode,
  timing: ChallengeTiming,
  tier: Difficulty,
  seed: string,
  plan: (i: number, q: QuizQuestion) => PlannedChallengeAnswer | null,
  max = 200,
): { state: ChallengeState; inputs: ChallengeInput[]; pool: QuizQuestion[] } {
  const pool = challengePool(mode, tier, seed);
  let state = startChallenge(mode, timing, tier, seed);
  const inputs: ChallengeInput[] = [];
  for (let i = 0; i < max && state.status === 'running'; i++) {
    const q = pool[state.index];
    if (!q) break;
    const p = plan(i, q);
    if (!p) break;
    const input: ChallengeInput = {
      questionId: q.id,
      answer: p.correct ? rightAnswer(q) : wrongAnswer(q),
      correct: p.correct,
      hintsUsed: p.hints ?? 0,
      freeHints: 0,
      timeMs: p.timeMs ?? 2000,
      ...(p.timedOut ? { timedOut: true } : {}),
    };
    const next = applyChallengeAnswer(state, pool, input);
    if (next.answers.length > state.answers.length) inputs.push(input);
    state = next;
  }
  return { state, inputs, pool };
}
