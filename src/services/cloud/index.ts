// Cloud save facade: owns the sync metadata, decides when to sync (start, after changes, focus,
// reconnect) and exposes account linking. Side effects only — the merge itself is pure.
import { create } from 'zustand';
import { backendConfig } from '../backend/config';
import { getSupabaseClient } from '../backend/supabaseClient';
import { useGameStore } from '../../store/useGameStore';
import { salvageProgress } from '../../game/engine/schema';
import { loadProfile } from '../leaderboard';
import { CloudSync, type CloudApi, type SyncMeta, type SyncOutcome } from './sync';
import { supabaseCloudApi, type AccountApi, type AccountInfo, type SupabaseAccountClient } from './supabaseCloud';

export const CLOUD_META_KEY = 'physics-companion-cloud';
/** Debounce after local changes before syncing. */
export const SYNC_DEBOUNCE_MS = 4000;
const RETRY_MS = 15_000;

export type CloudState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

interface CloudStatus {
  available: boolean;
  enabled: boolean;
  state: CloudState;
  lastSyncedAt: number | null;
  lastOutcome: SyncOutcome | null;
  account: AccountInfo | null;
  message: string | null;
}

export const useCloudStore = create<CloudStatus>()(() => ({
  available: false,
  enabled: false,
  state: 'idle',
  lastSyncedAt: null,
  lastOutcome: null,
  account: null,
  message: null,
}));

type Api = CloudApi & AccountApi;
let apiPromise: Promise<Api> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;
let applyingRemote = false;

function newDeviceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `web-${crypto.randomUUID().slice(0, 8)}` : `web-${Date.now().toString(36)}`;
}

export function loadMeta(): SyncMeta {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOUD_META_KEY) ?? 'null') as Partial<SyncMeta> | null;
    if (raw && typeof raw === 'object') {
      return {
        enabled: raw.enabled === true,
        userId: typeof raw.userId === 'string' ? raw.userId : null,
        revision: typeof raw.revision === 'number' ? raw.revision : 0,
        base: raw.base ? salvageProgress(raw.base) : null,
        lastSyncedAt: typeof raw.lastSyncedAt === 'number' ? raw.lastSyncedAt : null,
        deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : newDeviceId(),
      };
    }
  } catch {
    // fall through to a fresh record
  }
  return { enabled: false, userId: null, revision: 0, base: null, lastSyncedAt: null, deviceId: newDeviceId() };
}

function saveMeta(meta: SyncMeta): void {
  localStorage.setItem(CLOUD_META_KEY, JSON.stringify(meta));
  useCloudStore.setState({ enabled: meta.enabled, lastSyncedAt: meta.lastSyncedAt });
}

function getApi(): Promise<Api> | null {
  if (apiPromise) return apiPromise;
  if (!backendConfig.enabled) return null;
  apiPromise = getSupabaseClient(backendConfig).then((c) => supabaseCloudApi(c as SupabaseAccountClient));
  return apiPromise;
}

/** Test hook: use a fake API (null = back to the configured backend). */
export function setCloudApi(api: Api | null): void {
  apiPromise = api ? Promise.resolve(api) : null;
  const meta = loadMeta();
  useCloudStore.setState({
    available: !!api || backendConfig.enabled,
    enabled: meta.enabled,
    state: 'idle',
    lastSyncedAt: meta.lastSyncedAt,
    lastOutcome: null,
    account: null,
    message: null,
  });
}

async function runSync(): Promise<void> {
  const apiP = getApi();
  if (!apiP) return;
  const api = await apiP;
  const sync = new CloudSync({
    api,
    getProgress: () => useGameStore.getState().progress,
    setProgress: (p) => {
      applyingRemote = true;
      try {
        useGameStore.getState().setProgress(p);
      } finally {
        applyingRemote = false;
      }
    },
    loadMeta,
    saveMeta,
    now: () => Date.now(),
  });
  useCloudStore.setState({ state: 'syncing' });
  try {
    const outcome = await sync.sync();
    if (outcome === 'disabled') {
      useCloudStore.setState({ state: 'idle', lastOutcome: outcome });
      return;
    }
    useCloudStore.setState({ state: outcome === 'retry-later' ? 'offline' : 'synced', lastOutcome: outcome, message: null });
    if (outcome === 'downloaded' || outcome === 'merged') {
      useGameStore.getState().notify({ kind: 'info', title: 'Progress synced', message: 'Progress from your other devices was added.' });
    }
    if (outcome === 'retry-later') scheduleSync(RETRY_MS);
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    useCloudStore.setState({ state: offline ? 'offline' : 'error', message: e instanceof Error ? e.message : String(e) });
    scheduleSync(RETRY_MS);
  }
}

/** Runs a sync now (coalesced: a request during a sync runs once more afterwards). */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = runSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

export function scheduleSync(delayMs: number): void {
  if (!loadMeta().enabled) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delayMs);
}

export async function refreshAccount(): Promise<void> {
  const apiP = getApi();
  if (!apiP) return;
  try {
    const account = await (await apiP).currentAccount();
    useCloudStore.setState({ account });
  } catch {
    // offline: keep what we know
  }
}

export async function setCloudEnabled(enabled: boolean): Promise<void> {
  saveMeta({ ...loadMeta(), enabled });
  if (enabled) {
    await syncNow();
    await refreshAccount();
  } else {
    useCloudStore.setState({ state: 'idle' });
  }
}

export async function deleteCloudSave(): Promise<void> {
  const apiP = getApi();
  if (!apiP) return;
  await (await apiP).deleteSave();
  saveMeta({ ...loadMeta(), enabled: false, revision: 0, base: null, lastSyncedAt: null });
  useCloudStore.setState({ state: 'idle', lastOutcome: null });
}

function redirectUrl(): string {
  return `${window.location.origin}/profile`;
}

export async function linkEmail(email: string): Promise<string | null> {
  const apiP = getApi();
  if (!apiP) return 'Online features are not configured.';
  const error = await (await apiP).linkEmail(email.trim(), redirectUrl());
  await refreshAccount();
  return error;
}

export async function signInWithEmail(email: string): Promise<string | null> {
  const apiP = getApi();
  if (!apiP) return 'Online features are not configured.';
  return (await apiP).signInWithEmail(email.trim(), redirectUrl());
}

/** Wires cloud sync to the game. Returns a cleanup function. */
export function initCloudSync(): () => void {
  const apiP = getApi();
  useCloudStore.setState({ available: !!apiP, enabled: loadMeta().enabled, lastSyncedAt: loadMeta().lastSyncedAt });
  if (!apiP) return () => undefined;

  const unsubscribeStore = useGameStore.subscribe((state, prev) => {
    if (state.progress !== prev.progress && !applyingRemote) scheduleSync(SYNC_DEBOUNCE_MS);
  });
  const soon = () => scheduleSync(0);
  window.addEventListener('focus', soon);
  window.addEventListener('online', soon);
  let unsubscribeAuth: () => void = () => undefined;
  void apiP.then(async (api) => {
    let knownUser = (await api.currentAccount().catch(() => null))?.id ?? null;
    unsubscribeAuth = api.onUserChange((userId) => {
      void refreshAccount();
      // A switch between two accounts (e.g. after following a magic sign-in link) — not the first
      // anonymous sign-in — reloads the leaderboard profile and merges progress into the account.
      const switched = !!knownUser && !!userId && userId !== knownUser;
      if (userId) knownUser = userId;
      if (switched) {
        void loadProfile();
        scheduleSync(0);
      }
    });
    void refreshAccount();
  });
  scheduleSync(0);
  return () => {
    unsubscribeStore();
    unsubscribeAuth();
    window.removeEventListener('focus', soon);
    window.removeEventListener('online', soon);
    if (timer) clearTimeout(timer);
  };
}
