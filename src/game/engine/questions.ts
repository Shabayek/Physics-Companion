// Question bank: turns hand-written concept questions and seeded generators into quizzes.
// Everything here is deterministic for a given seed, so a quiz (or a single question) can be
// rebuilt from its id — the basis for shared daily challenges and server-side validation.
import type { Difficulty, Mission, QuizQuestion, TopicId } from '../../types';
import { createRng } from '../../lib/rng';
import { ALL_MISSIONS } from '../../data/missions';
import { GENERATORS, getGenerator } from '../../data/questions/generators';
import { fmt, type AnyQuestionGenerator } from './questionTypes';

const GENERATED_PREFIX = 'gen:';

export function generatedQuestionId(generatorId: string, seed: string): string {
  return `${GENERATED_PREFIX}${generatorId}:${seed}`;
}

export function parseGeneratedQuestionId(id: string): { generatorId: string; seed: string } | null {
  if (!id.startsWith(GENERATED_PREFIX)) return null;
  const rest = id.slice(GENERATED_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { generatorId: rest.slice(0, sep), seed: rest.slice(sep + 1) };
}

function roundingInstruction(decimals: number): string {
  if (decimals === 0) return 'Give your answer to the nearest whole number.';
  return `Round to ${decimals} decimal place${decimals === 1 ? '' : 's'}.`;
}

/** Creates the question a generator produces for `seed`. Same inputs → same question. */
export function instantiateGenerator(generator: AnyQuestionGenerator, seed: string): QuizQuestion {
  const g = generator.create(createRng(`${generator.id}:${seed}`));
  const base = {
    id: generatedQuestionId(generator.id, seed),
    explanation: g.explanation,
    hints: [...g.hints],
    topic: generator.topic,
    difficulty: generator.difficulty,
  };
  if (g.type === 'numeric') {
    const decimals = g.decimals ?? 2;
    const value = Number(g.answer);
    return {
      ...base,
      type: 'numeric',
      prompt: `${g.prompt} ${roundingInstruction(decimals)}`,
      answer: value,
      // Accept correct rounding (half a step, plus float slack) or ±1% for intermediate rounding.
      absTolerance: 0.5 * 10 ** -decimals + 1e-9,
      tolerance: g.tolerance ?? 0.01,
      ...(g.unit ? { unit: g.unit } : {}),
      answerText: g.unit ? `${fmt(value, decimals)} ${g.unit}` : fmt(value, decimals),
    };
  }
  return {
    ...base,
    type: g.type,
    prompt: g.prompt,
    answer: String(g.answer),
    options: g.options ?? (g.type === 'truefalse' ? ['True', 'False'] : []),
  };
}

/** Rebuilds a generated question from its id. */
export function generateQuestion(id: string): QuizQuestion | undefined {
  const parsed = parseGeneratedQuestionId(id);
  if (!parsed) return undefined;
  const generator = getGenerator(parsed.generatorId);
  return generator ? instantiateGenerator(generator, parsed.seed) : undefined;
}

let conceptIndex: Map<string, QuizQuestion> | null = null;
function conceptQuestions(): Map<string, QuizQuestion> {
  conceptIndex ??= new Map(ALL_MISSIONS.flatMap((m) => m.quiz.map((q) => [q.id, q] as const)));
  return conceptIndex;
}

/** Any question (hand-written or generated) by id. */
export function questionById(id: string): QuizQuestion | undefined {
  return conceptQuestions().get(id) ?? generateQuestion(id);
}

/** Deterministically shuffles multiple-choice options (true/false keeps its natural order). */
function withShuffledOptions(q: QuizQuestion, seed: string): QuizQuestion {
  if (q.type !== 'mcq' || !q.options || q.options.length < 2) return q;
  return { ...q, options: createRng(`${seed}:options:${q.id}`).shuffle(q.options) };
}

/** Fresh generated questions per mission quiz, by world. */
export const GENERATED_PER_MISSION: Record<Difficulty, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 2,
  expert: 2,
};

/**
 * A mission quiz: its hand-written concept questions, then fresh numeric questions from the
 * mission's generators. Use a new `seed` per attempt (e.g. the attempt number) for new numbers.
 */
export function buildMissionQuiz(mission: Mission, seed: string): QuizQuestion[] {
  const generators = (mission.generators ?? []).map(getGenerator).filter((g): g is AnyQuestionGenerator => !!g);
  const count = generators.length > 0 ? GENERATED_PER_MISSION[mission.world] : 0;
  const generated = Array.from({ length: count }, (_, i) =>
    instantiateGenerator(generators[i % generators.length] as AnyQuestionGenerator, `${mission.id}.${seed}.${i}`),
  );
  return [...mission.quiz, ...generated].map((q) => withShuffledOptions(q, `${mission.id}:${seed}`));
}

export interface QuestionSetOptions {
  worlds: readonly Difficulty[];
  count: number;
  seed: string;
  topics?: readonly TopicId[];
  minDifficulty?: 1 | 2 | 3;
  maxDifficulty?: 1 | 2 | 3;
  /** Share of generated (numeric) questions, 0–1. Default 0.5. */
  generatedRatio?: number;
  /** Concept question ids that must not be picked (e.g. already used in an earlier boss stage). */
  excludeIds?: ReadonlySet<string>;
}

/**
 * A mixed question set drawn from the whole bank (bosses, daily challenge, challenge mode).
 * Deterministic for the same options; no duplicate concept questions.
 */
export function buildQuestionSet(options: QuestionSetOptions): QuizQuestion[] {
  const { worlds, count, seed } = options;
  const minD = options.minDifficulty ?? 1;
  const maxD = options.maxDifficulty ?? 3;
  const topicOk = (t: TopicId | undefined) => !options.topics || (t !== undefined && options.topics.includes(t));
  const rng = createRng(`set:${seed}`);

  const concepts = rng.shuffle(
    ALL_MISSIONS.filter((m) => worlds.includes(m.world)).flatMap((m) =>
      m.quiz
        .map((q) => ({ ...q, topic: q.topic ?? m.topic }))
        .filter((q) => topicOk(q.topic) && q.difficulty >= minD && q.difficulty <= maxD && !options.excludeIds?.has(q.id)),
    ),
  );
  const generators = rng.shuffle(
    GENERATORS.filter(
      (g) => worlds.includes(g.world) && topicOk(g.topic) && g.difficulty >= minD && g.difficulty <= maxD,
    ),
  );

  const ratio = Math.min(1, Math.max(0, options.generatedRatio ?? 0.5));
  let wantGenerated = generators.length > 0 ? Math.round(count * ratio) : 0;
  const takeConcepts = Math.min(concepts.length, count - wantGenerated);
  if (takeConcepts < count - wantGenerated && generators.length > 0) wantGenerated = count - takeConcepts;

  const picked: QuizQuestion[] = concepts.slice(0, takeConcepts);
  for (let i = 0; i < wantGenerated; i++) {
    const g = generators[i % generators.length] as AnyQuestionGenerator;
    picked.push(instantiateGenerator(g, `${seed}.${i}`));
  }
  return rng.shuffle(picked).map((q) => withShuffledOptions(q, seed));
}
