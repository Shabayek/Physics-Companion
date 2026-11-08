// Leaderboard domain types shared by the online (Supabase) and local implementations.

export type BoardKind = 'challenge' | 'daily' | 'boss';
export type BoardPeriod = 'all' | 'week';

/** One answer in a submitted log: time (ms), correct, paid hints. */
export interface LogEntry {
  t: number;
  c: boolean;
  h: number;
}

export interface ScoreSubmission {
  /** Idempotency key: retries of the same run are only counted once. */
  clientId: string;
  kind: BoardKind;
  /** e.g. `challenge:blitz:standard`, `daily:2026-11-07:beginner`, `boss:boss-beginner`. */
  board: string;
  /** Points; for boss boards the hearts left (boss boards rank by `timeMs`). */
  score: number;
  timeMs: number;
  correct: number;
  answered: number;
  seed: string;
  log: LogEntry[];
  /** When the run finished (epoch ms) — used by the local board. */
  finishedAt: number;
}

export type SubmitStatus = 'accepted' | 'duplicate' | 'rejected' | 'retry';

export interface SubmitResult {
  status: SubmitStatus;
  code?: string;
  rank?: number;
}

export interface PlayerProfile {
  displayName: string;
  kidMode: boolean;
  isPublic: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  score: number;
  timeMs: number;
  createdAt: string;
  isMe: boolean;
}

export type SaveProfileResult = { ok: true; profile: PlayerProfile } | { ok: false; code: string };

export interface LeaderboardService {
  readonly mode: 'online' | 'local';
  getProfile(): Promise<PlayerProfile | null>;
  saveProfile(profile: PlayerProfile): Promise<SaveProfileResult>;
  /** Throws on network errors (the queue retries later). */
  submit(submission: ScoreSubmission): Promise<SubmitResult>;
  getBoard(board: string, period: BoardPeriod, limit?: number): Promise<LeaderboardEntry[]>;
  getMyRank(board: string, period: BoardPeriod): Promise<LeaderboardEntry | null>;
  deleteMyData(): Promise<void>;
}
