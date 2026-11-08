// Leaderboard facade: picks the online (Supabase) or local implementation, turns game events into
// submissions, and drives the offline queue. Side effects live here — never in the pure engine.
import { backendConfig, type BackendConfig } from '../backend/config';
import { getSupabaseClient } from '../backend/supabaseClient';
import { subscribeGameEvents } from '../../store/useGameStore';
import type { EventResult, GameEvent } from '../../game/engine/events';
import { LocalLeaderboard, type KeyValueStorage } from './localLeaderboard';
import { SupabaseLeaderboard } from './supabaseLeaderboard';
import { SubmissionQueue } from './queue';
import { buildSubmission } from './submissions';
import { checkSubmission } from './rules';
import { useOnlineStore } from './onlineStore';
import type { LeaderboardService, PlayerProfile, SaveProfileResult } from './types';

let servicePromise: Promise<LeaderboardService> | null = null;

/** Last known profile, so runs can be queued while the server is unreachable. */
export const PROFILE_CACHE_KEY = 'physics-companion-online-profile';

function cacheProfile(profile: PlayerProfile | null): void {
  if (profile) storage().setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  else storage().removeItem(PROFILE_CACHE_KEY);
}

function cachedProfile(): PlayerProfile | null {
  try {
    const raw: unknown = JSON.parse(storage().getItem(PROFILE_CACHE_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && typeof (raw as PlayerProfile).displayName === 'string') return raw as PlayerProfile;
  } catch {
    // ignore corrupted cache
  }
  return null;
}
let queue: SubmissionQueue | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function storage(): KeyValueStorage {
  return window.localStorage;
}

function getQueue(): SubmissionQueue {
  queue ??= new SubmissionQueue(storage());
  return queue;
}

export function createLeaderboardService(config: BackendConfig): Promise<LeaderboardService> {
  if (!config.enabled) return Promise.resolve(new LocalLeaderboard(storage()));
  return getSupabaseClient(config).then((client) => new SupabaseLeaderboard(client));
}

export function getLeaderboardService(): Promise<LeaderboardService> {
  servicePromise ??= createLeaderboardService(backendConfig);
  return servicePromise;
}

/** Test hook: replace the service (and reset queue/state). */
export function setLeaderboardService(service: LeaderboardService | null): void {
  servicePromise = service ? Promise.resolve(service) : null;
  queue = null;
  useOnlineStore.setState({ mode: service?.mode ?? 'local', profile: null, profileStatus: 'unknown', offline: false, pending: 0, last: null, error: null });
}

export async function loadProfile(): Promise<PlayerProfile | null> {
  const service = await getLeaderboardService();
  // Background refreshes keep the current UI; only a first load shows "Connecting…".
  const status = useOnlineStore.getState().profileStatus;
  useOnlineStore.setState({ mode: service.mode, profileStatus: status === 'ready' ? 'ready' : 'loading' });
  try {
    const profile = await service.getProfile();
    if (service.mode === 'online') cacheProfile(profile);
    useOnlineStore.setState({ profile, profileStatus: 'ready', offline: false, error: null });
    return profile;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const cached = cachedProfile();
    // Offline with a known profile: keep playing; runs are queued and uploaded later.
    if (cached) useOnlineStore.setState({ profile: cached, profileStatus: 'ready', offline: true, error: message });
    else useOnlineStore.setState({ profileStatus: 'error', offline: true, error: message });
    return cached;
  }
}

export async function saveProfile(profile: PlayerProfile): Promise<SaveProfileResult> {
  const service = await getLeaderboardService();
  const result = await service.saveProfile(profile);
  if (result.ok) {
    cacheProfile(result.profile);
    useOnlineStore.setState({ profile: result.profile, profileStatus: 'ready', offline: false, error: null });
  }
  return result;
}

export async function flushQueue(force = false): Promise<void> {
  const service = await getLeaderboardService();
  if (service.mode !== 'online') return;
  const report = await getQueue().flush(service, force);
  if (!report.offline && useOnlineStore.getState().offline && report.accepted.length + report.rejected.length > 0) {
    useOnlineStore.setState({ offline: false });
  }
  if (report.offline) useOnlineStore.setState({ offline: true });
  const lastAccepted = report.accepted[report.accepted.length - 1];
  const lastRejected = report.rejected[report.rejected.length - 1];
  useOnlineStore.setState((s) => ({
    pending: report.remaining,
    last: lastRejected
      ? { kind: 'rejected', board: lastRejected.submission.board, ...(lastRejected.code ? { code: lastRejected.code } : {}) }
      : lastAccepted
        ? { kind: 'accepted', board: lastAccepted.submission.board, ...(lastAccepted.rank !== undefined ? { rank: lastAccepted.rank } : {}) }
        : s.last,
  }));
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = report.remaining > 0 ? setTimeout(() => void flushQueue(), 30_000) : null;
}

function newClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Called after every game event; submits leaderboard-worthy runs. */
export async function handleGameEvent(event: GameEvent, result: EventResult): Promise<void> {
  const submission = buildSubmission(event, result, newClientId(), Date.now());
  if (!submission) return;
  const service = await getLeaderboardService();
  if (service.mode === 'local') {
    const r = await service.submit(submission);
    useOnlineStore.setState({ last: { kind: 'accepted', board: submission.board, ...(r.rank !== undefined ? { rank: r.rank } : {}) } });
    return;
  }
  const state = useOnlineStore.getState();
  const profile = state.profileStatus === 'ready' ? state.profile : await loadProfile();
  if (!profile) {
    useOnlineStore.setState({ last: { kind: 'skipped', board: submission.board, code: 'no_profile' } });
    return;
  }
  const problem = checkSubmission(submission);
  if (problem) {
    useOnlineStore.setState({ last: { kind: 'rejected', board: submission.board, code: problem } });
    return;
  }
  getQueue().enqueue(submission);
  useOnlineStore.setState({ pending: getQueue().items().length });
  await flushQueue(true);
}

/** Deletes online data (scores, profile) and the local queue; signs out. */
export async function deleteMyOnlineData(): Promise<void> {
  const service = await getLeaderboardService();
  await service.deleteMyData();
  getQueue().clear();
  cacheProfile(null);
  useOnlineStore.setState({ profile: null, profileStatus: 'ready', offline: false, pending: 0, last: null });
}

/** Wires the leaderboard to the game. Returns a cleanup function. */
export function initLeaderboard(): () => void {
  const unsubscribe = subscribeGameEvents((event, result) => {
    void handleGameEvent(event, result).catch((e: unknown) => useOnlineStore.setState({ error: e instanceof Error ? e.message : String(e) }));
  });
  const onOnline = () => void flushQueue(true).catch(() => undefined);
  window.addEventListener('online', onOnline);
  void getLeaderboardService().then((s) => {
    useOnlineStore.setState({ mode: s.mode, pending: s.mode === 'online' ? getQueue().items().length : 0 });
    if (s.mode === 'online') {
      void loadProfile().then(() => flushQueue().catch(() => undefined));
    }
  });
  return () => {
    unsubscribe();
    window.removeEventListener('online', onOnline);
    if (retryTimer) clearTimeout(retryTimer);
  };
}
