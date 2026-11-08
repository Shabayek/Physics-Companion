// Simulates boss battles for tests: produces the answer log a player would generate.
import { applyBossAnswer, bossStagePools, nextBossQuestion, startBossBattle, type BossBattle } from '../../src/game/engine/boss';
import type { AnswerRecord, Boss, QuizQuestion } from '../../src/types';
import { rightAnswer, wrongAnswer } from './answers';

export interface PlannedAnswer {
  correct: boolean;
  hints?: number;
  timeMs?: number;
}

/**
 * Plays a battle following `plan(i, question)` until it ends (or `maxAnswers` is reached).
 * Returns the battle and the questions that were asked.
 */
export function simulateBoss(
  boss: Boss,
  seed: string,
  plan: (i: number, q: QuizQuestion) => PlannedAnswer,
  maxAnswers = 100,
): { battle: BossBattle; questions: QuizQuestion[] } {
  const pools = bossStagePools(boss, seed);
  let battle = startBossBattle(boss, seed);
  const questions: QuizQuestion[] = [];
  for (let i = 0; i < maxAnswers; i++) {
    const q = nextBossQuestion(battle, pools);
    if (!q) break;
    questions.push(q);
    const p = plan(i, q);
    const record: AnswerRecord = {
      questionId: q.id,
      answer: p.correct ? rightAnswer(q) : wrongAnswer(q),
      correct: p.correct,
      hintsUsed: p.hints ?? 0,
      freeHints: 0,
      timeMs: p.timeMs ?? 5000,
    };
    battle = applyBossAnswer(battle, record, pools);
  }
  return { battle, questions };
}
