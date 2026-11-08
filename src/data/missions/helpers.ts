import type { Difficulty, InteractiveKind, Mission, QuizQuestion, Reward, TopicId } from '../../types';

/** Multiple choice. `answer` must not be repeated in `distractors`; options are shuffled at quiz time. */
export function mcq(
  id: string,
  prompt: string,
  answer: string,
  distractors: string[],
  explanation: string,
  hints: string[],
  difficulty: 1 | 2 | 3 = 1,
): QuizQuestion {
  return { id, type: 'mcq', prompt, options: [answer, ...distractors], answer, explanation, hints, difficulty };
}

export function tf(
  id: string,
  statement: string,
  answer: boolean,
  explanation: string,
  hints: string[],
  difficulty: 1 | 2 | 3 = 1,
): QuizQuestion {
  return {
    id,
    type: 'truefalse',
    prompt: statement,
    options: ['True', 'False'],
    answer: answer ? 'True' : 'False',
    explanation,
    hints,
    difficulty,
  };
}

const QUANTA: Record<Difficulty, number> = { beginner: 10, intermediate: 20, advanced: 30, expert: 50 };

export interface MissionSpec {
  id: string;
  world: Difficulty;
  zone: string;
  title: string;
  concept: string;
  equation: string;
  interactive: InteractiveKind;
  topic: TopicId;
  quiz: QuizQuestion[];
  generators?: string[];
  extraRewards?: Reward[];
}

export function mission(spec: MissionSpec): Mission {
  const { id, world, zone, title, concept, equation, interactive, topic, quiz, generators, extraRewards } = spec;
  return {
    id,
    world,
    zone,
    title,
    concept,
    topic,
    intro: [
      { type: 'text', value: concept },
      { type: 'equation', value: equation },
    ],
    steps: [
      { id: `${id}-g`, kind: 'guided', title: 'Learn', prompt: `Guided: ${equation}`, interactive },
      { id: `${id}-p`, kind: 'practice', title: 'Practice', prompt: `Try it: ${equation}`, interactive },
    ],
    quiz: quiz.map((q) => ({ ...q, topic })),
    ...(generators ? { generators } : {}),
    rewards: [{ type: 'currency', id: 'quanta', amount: QUANTA[world] }, { type: 'badge', id: `badge-${id}` }, ...(extraRewards ?? [])],
  };
}
