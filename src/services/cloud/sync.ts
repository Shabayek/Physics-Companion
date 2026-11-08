// Cloud save synchronisation (three-way merge + optimistic concurrency).
import type { Progress } from '../../types';
import { canonicalJson, mergeProgress } from '../../game/engine/merge';
import { salvageProgress } from '../../game/engine/schema';
import { defaultProgress } from '../../game/engine/progress';

export interface RemoteSave {
  progress: unknown;
  revision: number;
  device: string;
  updatedAt: string;
}

export type PutResult =
  | { status: 'ok'; revision: number }
  | { status: 'conflict'; revision: number; progress: unknown }
  | { status: 'retry' | 'error'; code?: string };

export interface CloudApi {
  /** Signed-in user id (signs in anonymously if needed). */
  ensureSession(): Promise<string>;
  /** Throws on network errors. */
  getSave(): Promise<RemoteSave | null>;
  putSave(progress: Progress, expectedRevision: number, device: string): Promise<PutResult>;
  deleteSave(): Promise<void>;
}

export interface SyncMeta {
  enabled: boolean;
  /** Account the base/revision belong to; a different account resets them. */
  userId: string | null;
  revision: number;
  /** Last version both this device and the cloud agreed on (three-way merge base). */
  base: Progress | null;
  lastSyncedAt: number | null;
  deviceId: string;
}

export type SyncOutcome = 'disabled' | 'up-to-date' | 'uploaded' | 'downloaded' | 'merged' | 'retry-later';

export interface CloudSyncDeps {
  api: CloudApi;
  getProgress(): Progress;
  setProgress(p: Progress): void;
  loadMeta(): SyncMeta;
  saveMeta(meta: SyncMeta): void;
  now(): number;
}

const MAX_ATTEMPTS = 3;
const same = (a: Progress, b: Progress | null) => !!b && canonicalJson(a) === canonicalJson(b);

export class CloudSync {
  private readonly deps: CloudSyncDeps;

  constructor(deps: CloudSyncDeps) {
    this.deps = deps;
  }

  /** One synchronisation round. Throws on network errors (callers retry later). */
  async sync(): Promise<SyncOutcome> {
    const { api, getProgress, setProgress, now } = this.deps;
    let meta = this.deps.loadMeta();
    if (!meta.enabled) return 'disabled';

    const userId = await api.ensureSession();
    if (meta.userId !== userId) meta = { ...meta, userId, revision: 0, base: null };

    const commit = (revision: number, base: Progress): void => {
      meta = { ...meta, revision, base, lastSyncedAt: now() };
      this.deps.saveMeta(meta);
    };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const local = getProgress();
      const remote = await api.getSave();

      if (!remote) {
        const r = await api.putSave(local, 0, meta.deviceId);
        if (r.status === 'ok') {
          commit(r.revision, local);
          return 'uploaded';
        }
        if (r.status === 'conflict') continue;
        return 'retry-later';
      }

      const remoteProgress = salvageProgress(remote.progress);
      if (remote.revision === meta.revision && meta.base) {
        // Nobody else wrote since our last sync.
        if (same(local, meta.base)) {
          commit(meta.revision, meta.base);
          return 'up-to-date';
        }
        const r = await api.putSave(local, meta.revision, meta.deviceId);
        if (r.status === 'ok') {
          commit(r.revision, local);
          return 'uploaded';
        }
        if (r.status === 'conflict') continue;
        return 'retry-later';
      }

      // The cloud changed: merge it into local progress.
      // A brand-new device (untouched default progress) is "unchanged" too: this is a download.
      const localUnchanged = same(local, meta.base ?? defaultProgress(local.playerName));
      const merged = mergeProgress(meta.base, local, remoteProgress);
      if (getProgress() !== local) continue; // the player changed something meanwhile — start over
      if (!same(merged, local)) setProgress(merged);
      const result = getProgress(); // setProgress may award achievements on top of the merge

      if (same(result, remoteProgress)) {
        commit(remote.revision, result);
        return localUnchanged ? 'downloaded' : 'merged';
      }
      const r = await api.putSave(result, remote.revision, meta.deviceId);
      if (r.status === 'ok') {
        commit(r.revision, result);
        return localUnchanged ? 'downloaded' : 'merged';
      }
      if (r.status === 'conflict') continue;
      // Could not upload yet: remember what we merged against so the next round is a clean update.
      commit(remote.revision, remoteProgress);
      return 'retry-later';
    }
    return 'retry-later';
  }
}
