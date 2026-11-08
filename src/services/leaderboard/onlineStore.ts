import { create } from 'zustand';
import type { PlayerProfile } from './types';

export interface LeaderboardNotice {
  kind: 'accepted' | 'rejected' | 'skipped';
  board: string;
  rank?: number;
  code?: string;
}

interface OnlineState {
  mode: 'online' | 'local';
  profile: PlayerProfile | null;
  profileStatus: 'unknown' | 'loading' | 'ready' | 'error';
  /** The server could not be reached (the cached profile is used; scores are queued). */
  offline: boolean;
  /** Scores waiting in the offline queue. */
  pending: number;
  /** Result of the most recent submission (for the leaderboard page). */
  last: LeaderboardNotice | null;
  error: string | null;
}

/** Transient (not persisted) state of the online leaderboard. */
export const useOnlineStore = create<OnlineState>()(() => ({
  mode: 'local',
  profile: null,
  profileStatus: 'unknown',
  offline: false,
  pending: 0,
  last: null,
  error: null,
}));
