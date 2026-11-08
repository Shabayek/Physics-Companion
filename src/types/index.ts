export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type Theme = 'light' | 'dark' | 'high-contrast';
export type AgeMode = 'kid' | 'standard';
export type Locale = 'en';

export type ConstantCategory =
  | 'mechanics'
  | 'electromagnetism'
  | 'thermodynamics'
  | 'quantum'
  | 'relativity'
  | 'nuclear'
  | 'optics'
  | 'waves'
  | 'fluids'
  | 'general';

export interface PhysicsConstant {
  id: string;
  symbol: string;
  name: string;
  value: number;
  unit: string;
  description: string;
  category: ConstantCategory;
}

export interface PhysicsLaw {
  id: string;
  name: string;
  formula: string;
  domain: string;
  description: string;
  variables: { symbol: string; name: string; unit: string }[];
  funFact: string;
}

export interface Concept {
  id: string;
  title: string;
  difficulty: Difficulty;
  summary: string;
  details: string;
  relatedLaws: string[];
  relatedConstants: string[];
}

export interface ContentBlock {
  type: 'text' | 'image' | 'animation' | 'equation' | 'simulation';
  value: string;
  caption?: string;
}

export type InteractiveKind =
  | 'motion-simulator'
  | 'force-diagram'
  | 'circuit-builder'
  | 'optics-bench'
  | 'wave-lab'
  | 'pendulum-spring'
  | 'projectile-cannon'
  | 'orbit-simulator'
  | 'collision-lab'
  | 'heat-engine'
  | 'induction-lab'
  | 'bernoulli-tube'
  | 'doppler-radar'
  | 'time-dilation'
  | 'photoelectric-lab'
  | 'quantum-tunnel'
  | 'nuclear-decay'
  | 'rlc-resonance'
  | 'cosmic-expansion'
  | 'entropy-engine'
  | 'magnet-hunt'
  | 'shadow-maker'
  | 'ramp-roll'
  | 'buoyancy-boat'
  | 'lens-lab';

export interface MissionStep {
  id: string;
  kind: 'guided' | 'practice' | 'quiz';
  title: string;
  prompt: string;
  interactive?: InteractiveKind;
  data?: Record<string, unknown>;
}

/** Physics topic a question or mission belongs to (used for question selection). */
export type TopicId =
  | 'speed'
  | 'free-fall'
  | 'forces'
  | 'light'
  | 'magnetism'
  | 'energy'
  | 'inertia'
  | 'buoyancy'
  | 'pendulum'
  | 'circuits'
  | 'newton-second-law'
  | 'ohms-law'
  | 'waves'
  | 'lenses'
  | 'momentum'
  | 'projectiles'
  | 'orbits'
  | 'heat-engines'
  | 'induction'
  | 'springs'
  | 'fluids'
  | 'doppler'
  | 'relativity'
  | 'photoelectric'
  | 'tunneling'
  | 'nuclear-decay'
  | 'resonance'
  | 'cosmology'
  | 'entropy';

export interface QuizQuestion {
  id: string;
  prompt: string;
  type: 'mcq' | 'truefalse' | 'fillblank' | 'dragmatch' | 'numeric';
  options?: string[];
  answer: string | string[] | number;
  /** Relative tolerance for numeric answers (0.01 = ±1% of the target). */
  tolerance?: number;
  /** Absolute tolerance for numeric answers (e.g. half of the requested rounding step). */
  absTolerance?: number;
  /** Unit shown next to a numeric input, e.g. "m/s". */
  unit?: string;
  /** Human-readable correct answer, e.g. "2.35 m/s" (defaults to `answer`). */
  answerText?: string;
  explanation: string;
  /** Tiered hints: nudge → formula → worked first step. Each paid hint costs 25% of the question's credit. */
  hints?: string[];
  topic?: TopicId;
  difficulty: 1 | 2 | 3;
}

/** One answered question, as recorded by the QuizRunner (also the unit of the server-side answer log). */
export interface AnswerRecord {
  questionId: string;
  answer: string;
  correct: boolean;
  /** Hints revealed (including free ones). */
  hintsUsed: number;
  /** Hints that were free (Kid mode). */
  freeHints: number;
  /** Time from question shown to answer checked. */
  timeMs: number;
}

export interface Reward {
  type: 'currency' | 'badge' | 'constant' | 'law' | 'avatar';
  id: string;
  amount?: number;
}

export interface Mission {
  id: string;
  world: Difficulty;
  zone: string;
  title: string;
  concept: string;
  intro: ContentBlock[];
  steps: MissionStep[];
  quiz: QuizQuestion[];
  rewards: Reward[];
  topic: TopicId;
  /** Question generators used to add fresh numeric questions to the quiz (see data/questions). */
  generators?: string[];
  boss?: boolean;
}

export interface BossStage {
  name: string;
  /** Line the boss says when the stage begins. */
  taunt: string;
  /** Share of generated (numeric) questions in this stage, 0–1. */
  generatedRatio: number;
  minDifficulty?: 1 | 2 | 3;
}

export interface Boss {
  id: string;
  world: Difficulty;
  name: string;
  emoji: string;
  lore: string;
  /** Exactly three stages; each holds a third of the boss's HP. */
  stages: [BossStage, BossStage, BossStage];
  rewards: { quanta: number; badge: string; laws: string[]; constants: string[] };
}

export interface MissionProgress {
  missionId: string;
  completed: boolean;
  stars: 0 | 1 | 2 | 3;
  bestScore: number;
  attempts: number;
  lastPlayed: number;
}

export interface Settings {
  audio: boolean;
  textSize: 'sm' | 'md' | 'lg';
  reducedMotion: boolean;
  kidTone: boolean;
  /** Challenge-mode timers: standard, relaxed (×1.5) or untimed (accessibility). */
  challengeTiming: 'standard' | 'relaxed' | 'untimed';
}

/** Lifetime counters that cannot be derived from other progress data. */
export interface PlayerStats {
  quizzesTaken: number;
  questionsAnswered: number;
  questionsCorrect: number;
  perfectQuizzes: number;
  /** Longest run of consecutive correct answers inside a single quiz. */
  bestAnswerStreak: number;
  /** Hints revealed (free + paid). */
  hintsUsed: number;
  /** Mission quizzes passed (≥1★) without revealing any hint. */
  hintFreeQuizzes: number;
  /** Boss victories without revealing any hint. */
  bossWinsWithoutHints: number;
  /** Boss victories with exactly one heart left. */
  clutchBossWins: number;
  dailyChallengesCompleted: number;
  perfectDailies: number;
  /** Sprint runs with all 10 answers correct. */
  perfectSprints: number;
  /** Most correct answers in a single Survival run. */
  longestSurvival: number;
  /** Longest combo in challenge mode. */
  bestChallengeCombo: number;
  /** Lifetime Quanta earned (spending never lowers this). */
  quantaEarned: number;
}

/** Daily activity streak. Dates are local calendar days (`YYYY-MM-DD`). */
export interface StreakState {
  current: number;
  longest: number;
  lastActiveDate: string | null;
}

export interface DailyRecord {
  score: number;
  correct: number;
  total: number;
  completedAt: number;
  tier: Difficulty;
  stars: 0 | 1 | 2 | 3;
}

export interface DailyState {
  lastCompletedDate: string | null;
  history: Record<string, DailyRecord>;
}

export interface BossRecord {
  defeated: boolean;
  attempts: number;
  bestTimeMs: number | null;
  bestHeartsLeft: number;
  defeatedAt: number | null;
}

export interface AchievementRecord {
  unlockedAt: number;
}

export type AchievementCategory = 'missions' | 'mastery' | 'knowledge' | 'bosses' | 'dedication' | 'challenge';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  /** Hidden until unlocked. */
  secret?: boolean;
  /** Quanta granted on unlock. */
  quanta: number;
  /** Progress towards the goal; unlocked when current ≥ target. Must be pure. */
  progress: (p: Progress) => { current: number; target: number };
}

export interface ChallengeBest {
  score: number;
  at: number;
  correct: number;
  answered: number;
}

export interface ChallengeState {
  runs: number;
  best: Record<string, ChallengeBest>;
}

export interface Progress {
  version: number;
  playerName: string;
  ageMode: AgeMode;
  theme: Theme;
  locale: Locale;
  unlockedWorlds: Difficulty[];
  missions: Record<string, MissionProgress>;
  collection: { constants: string[]; laws: string[]; badges: string[]; avatarItems: string[] };
  currency: number;
  settings: Settings;
  stats: PlayerStats;
  streak: StreakState;
  daily: DailyState;
  bosses: Record<string, BossRecord>;
  achievements: Record<string, AchievementRecord>;
  challenge: ChallengeState;
}

export interface ScoreResult {
  points: number;
  stars: 0 | 1 | 2 | 3;
  /** Longest run of consecutive correct answers. */
  streak: number;
  /** Points earned for answering quickly (already included in `points`). */
  speedBonus: number;
  bonuses: string[];
}
