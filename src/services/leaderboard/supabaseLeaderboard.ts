// Online leaderboard backed by Supabase RPCs (see supabase/migrations/*_leaderboard.sql).
// Written against a minimal client interface so it can be tested with a fake.
import { ensureSession } from '../backend/session';
import type { BoardPeriod, LeaderboardEntry, LeaderboardService, PlayerProfile, SaveProfileResult, ScoreSubmission, SubmitResult } from './types';

export const CLIENT_VERSION = 'web-1';

interface RpcError {
  message: string;
  code?: string;
}

export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>;
    signInAnonymously(): Promise<{ data: { session: { user: { id: string } } | null }; error: { message: string } | null }>;
    signOut(): Promise<{ error: unknown }>;
  };
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

export class NetworkError extends Error {}

interface Row {
  rank: number | string;
  display_name: string;
  score: number;
  time_ms: number;
  created_at: string;
  is_me: boolean;
}

function toEntry(r: Row): LeaderboardEntry {
  return { rank: Number(r.rank), displayName: r.display_name, score: r.score, timeMs: r.time_ms, createdAt: r.created_at, isMe: !!r.is_me };
}

export class SupabaseLeaderboard implements LeaderboardService {
  readonly mode = 'online' as const;
  private readonly client: SupabaseLike;

  constructor(client: SupabaseLike) {
    this.client = client;
  }

  /** Signs in anonymously on first use; the session is persisted by supabase-js. */
  ensureSession(): Promise<string> {
    return ensureSession(this.client);
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new NetworkError(`${fn}: ${error.message}`);
    return data as T;
  }

  async getProfile(): Promise<PlayerProfile | null> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return null;
    const row = await this.call<{ display_name: string; kid_mode: boolean; is_public: boolean } | null>('get_my_profile', {});
    return row ? { displayName: row.display_name, kidMode: row.kid_mode, isPublic: row.is_public } : null;
  }

  async saveProfile(p: PlayerProfile): Promise<SaveProfileResult> {
    await this.ensureSession();
    const r = await this.call<{ status: string; code?: string }>('upsert_profile', {
      p_display_name: p.displayName,
      p_kid_mode: p.kidMode,
      p_is_public: p.isPublic,
    });
    return r.status === 'ok' ? { ok: true, profile: { ...p, displayName: p.displayName.trim() } } : { ok: false, code: r.code ?? 'error' };
  }

  async submit(s: ScoreSubmission): Promise<SubmitResult> {
    await this.ensureSession();
    const r = await this.call<{ status: string; code?: string; rank?: number }>('submit_score', {
      p_client_id: s.clientId,
      p_kind: s.kind,
      p_board: s.board,
      p_score: s.score,
      p_time_ms: s.timeMs,
      p_correct: s.correct,
      p_answered: s.answered,
      p_seed: s.seed,
      p_log: s.log,
      p_client_version: CLIENT_VERSION,
    });
    const status = (['accepted', 'duplicate', 'rejected', 'retry'] as const).find((x) => x === r.status) ?? 'rejected';
    return { status, ...(r.code ? { code: r.code } : {}), ...(typeof r.rank === 'number' ? { rank: r.rank } : {}) };
  }

  async getBoard(board: string, period: BoardPeriod, limit = 20): Promise<LeaderboardEntry[]> {
    const rows = await this.call<Row[] | null>('get_leaderboard', { p_board: board, p_period: period, p_limit: limit });
    return (rows ?? []).map(toEntry);
  }

  async getMyRank(board: string, period: BoardPeriod): Promise<LeaderboardEntry | null> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return null;
    const rows = await this.call<Row[] | null>('get_my_rank', { p_board: board, p_period: period });
    const row = rows?.[0];
    return row ? toEntry(row) : null;
  }

  async deleteMyData(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return;
    await this.call('delete_my_data', {});
    await this.client.auth.signOut();
  }
}
