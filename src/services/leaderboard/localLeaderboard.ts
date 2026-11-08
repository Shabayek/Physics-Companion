// Offline / unconfigured fallback: a personal board of your best runs on this device.
import type { BoardPeriod, LeaderboardEntry, LeaderboardService, PlayerProfile, SaveProfileResult, ScoreSubmission, SubmitResult } from './types';

export const LOCAL_BOARD_KEY = 'physics-companion-local-board';
/** Runs kept per board. */
export const LOCAL_BOARD_LIMIT = 20;

interface LocalEntry {
  clientId: string;
  score: number;
  timeMs: number;
  finishedAt: number;
}

type Stored = Record<string, LocalEntry[]>;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function startOfWeekUtc(now: number): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

function compare(board: string) {
  const boss = board.startsWith('boss:');
  return (a: LocalEntry, b: LocalEntry) =>
    boss ? a.timeMs - b.timeMs || b.score - a.score : b.score - a.score || a.timeMs - b.timeMs || a.finishedAt - b.finishedAt;
}

export class LocalLeaderboard implements LeaderboardService {
  readonly mode = 'local' as const;
  private readonly storage: KeyValueStorage;
  private readonly now: () => number;

  constructor(storage: KeyValueStorage, now: () => number = () => Date.now()) {
    this.storage = storage;
    this.now = now;
  }

  private read(): Stored {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(LOCAL_BOARD_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Stored) : {};
    } catch {
      return {};
    }
  }

  async getProfile(): Promise<PlayerProfile | null> {
    return null;
  }

  async saveProfile(): Promise<SaveProfileResult> {
    return { ok: false, code: 'offline' };
  }

  async submit(s: ScoreSubmission): Promise<SubmitResult> {
    const all = this.read();
    const entries = all[s.board] ?? [];
    if (entries.some((e) => e.clientId === s.clientId)) return { status: 'duplicate' };
    const next = [...entries, { clientId: s.clientId, score: s.score, timeMs: s.timeMs, finishedAt: s.finishedAt }]
      .sort(compare(s.board))
      .slice(0, LOCAL_BOARD_LIMIT);
    this.storage.setItem(LOCAL_BOARD_KEY, JSON.stringify({ ...all, [s.board]: next }));
    const index = next.findIndex((e) => e.clientId === s.clientId);
    return index >= 0 ? { status: 'accepted', rank: index + 1 } : { status: 'accepted' };
  }

  async getBoard(board: string, period: BoardPeriod, limit = 20): Promise<LeaderboardEntry[]> {
    const since = period === 'week' ? startOfWeekUtc(this.now()) : 0;
    return (this.read()[board] ?? [])
      .filter((e) => e.finishedAt >= since)
      .sort(compare(board))
      .slice(0, limit)
      .map((e, i) => ({ rank: i + 1, displayName: 'You', score: e.score, timeMs: e.timeMs, createdAt: new Date(e.finishedAt).toISOString(), isMe: true }));
  }

  async getMyRank(): Promise<LeaderboardEntry | null> {
    return null;
  }

  async deleteMyData(): Promise<void> {
    this.storage.removeItem(LOCAL_BOARD_KEY);
  }
}
