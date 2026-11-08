import { describe, it, expect } from 'vitest';
import { CloudSync, type CloudApi, type PutResult, type RemoteSave, type SyncMeta } from '../src/services/cloud/sync';
import { defaultProgress, recordMission } from '../src/game/engine/progress';
import type { Progress } from '../src/types';

/** In-memory cloud with the same semantics as put_cloud_save (optimistic concurrency). */
class FakeCloud {
  save: RemoteSave | null = null;
  offline = false;
  puts = 0;
  /** Hook to simulate another device writing between our read and our write. */
  beforePut: (() => void) | null = null;

  api(userId = 'user-1'): CloudApi {
    return {
      ensureSession: async () => {
        if (this.offline) throw new Error('offline');
        return userId;
      },
      getSave: async () => {
        if (this.offline) throw new Error('offline');
        return this.save ? structuredClone(this.save) : null;
      },
      putSave: async (progress, expected, device): Promise<PutResult> => {
        if (this.offline) throw new Error('offline');
        const hook = this.beforePut;
        this.beforePut = null;
        hook?.();
        this.puts++;
        const current = this.save?.revision ?? 0;
        if (expected !== current) return { status: 'conflict', revision: current, progress: this.save?.progress ?? null };
        this.save = { progress: structuredClone(progress), revision: current + 1, device, updatedAt: new Date().toISOString() };
        return { status: 'ok', revision: current + 1 };
      },
      deleteSave: async () => {
        this.save = null;
      },
    };
  }
}

class Device {
  progress: Progress;
  meta: SyncMeta;
  sync: CloudSync;
  constructor(cloud: FakeCloud, name: string, progress: Progress = defaultProgress(), userId = 'user-1') {
    this.progress = progress;
    this.meta = { enabled: true, userId: null, revision: 0, base: null, lastSyncedAt: null, deviceId: name };
    this.sync = new CloudSync({
      api: cloud.api(userId),
      getProgress: () => this.progress,
      setProgress: (p) => {
        this.progress = p;
      },
      loadMeta: () => this.meta,
      saveMeta: (m) => {
        this.meta = m;
      },
      now: () => 1000,
    });
  }
  earn(quanta: number, mission?: string) {
    this.progress = { ...(mission ? recordMission(this.progress, mission, 3, 50, 1) : this.progress), currency: this.progress.currency + quanta };
  }
}

describe('CloudSync', () => {
  it('disabled → does nothing', async () => {
    const cloud = new FakeCloud();
    const d = new Device(cloud, 'a');
    d.meta.enabled = false;
    expect(await d.sync.sync()).toBe('disabled');
    expect(cloud.puts).toBe(0);
  });

  it('first sync uploads; then up-to-date; local changes upload', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud, 'a');
    a.earn(50);
    expect(await a.sync.sync()).toBe('uploaded');
    expect(cloud.save?.revision).toBe(1);
    expect(a.meta).toMatchObject({ userId: 'user-1', revision: 1, lastSyncedAt: 1000 });
    expect(await a.sync.sync()).toBe('up-to-date');
    a.earn(10);
    expect(await a.sync.sync()).toBe('uploaded');
    expect((cloud.save?.progress as Progress | undefined)?.currency).toBe(60);
  });

  it('a second device downloads, and both devices earning concurrently add up', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud, 'a');
    a.earn(100, 'b-speed');
    await a.sync.sync();

    const b = new Device(cloud, 'b'); // fresh device, never synced
    expect(await b.sync.sync()).toBe('downloaded');
    expect(b.progress.currency).toBe(100);
    expect(b.progress.missions['b-speed']?.completed).toBe(true);

    a.earn(30, 'b-gravity');
    b.earn(20, 'b-ramp');
    expect(await a.sync.sync()).toBe('uploaded');
    expect(await b.sync.sync()).toBe('merged'); // b merges a's upload into its own progress
    expect(b.progress.currency).toBe(150);
    expect(await a.sync.sync()).toBe('downloaded');
    expect(a.progress.currency).toBe(150);
    expect(Object.keys(a.progress.missions).sort()).toEqual(['b-gravity', 'b-ramp', 'b-speed']);
    expect(a.progress).toEqual(b.progress);
  });

  it('a device with existing progress joining an account keeps both (no common base)', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud, 'a');
    a.earn(70);
    await a.sync.sync();
    const b = new Device(cloud, 'b');
    b.earn(40);
    expect(await b.sync.sync()).toBe('merged');
    expect(b.progress.currency).toBe(110);
  });

  it('a write that races with ours → conflict → merge again and retry', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud, 'a');
    await a.sync.sync();
    const b = new Device(cloud, 'b');
    await b.sync.sync();
    a.earn(5);
    // Another device uploads right before our write.
    cloud.beforePut = () => {
      cloud.save = { ...(cloud.save as RemoteSave), progress: { ...(cloud.save?.progress as Progress), currency: 7 }, revision: 2 };
    };
    expect(await a.sync.sync()).toBe('merged');
    expect(a.progress.currency).toBe(12);
    expect(cloud.save?.revision).toBe(3);
  });

  it('never overwrites progress made while a sync is running', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud, 'a');
    await a.sync.sync();
    const b = new Device(cloud, 'b');
    await b.sync.sync();
    b.earn(10);
    await b.sync.sync();
    // While a downloads, the player earns Quanta on a.
    const api = cloud.api();
    const originalGet = api.getSave;
    let once = true;
    (a.sync as unknown as { deps: { api: CloudApi } }).deps.api = {
      ...api,
      getSave: async () => {
        const r = await originalGet();
        if (once) {
          once = false;
          a.earn(3);
        }
        return r;
      },
    };
    await a.sync.sync();
    expect(a.progress.currency).toBe(13);
  });

  it('switching account (e.g. email sign-in on this device) resets the merge base', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud, 'a');
    a.earn(10);
    await a.sync.sync();
    const other = new FakeCloud();
    other.save = { progress: { ...defaultProgress(), currency: 500 }, revision: 4, device: 'x', updatedAt: '' };
    const b = new Device(other, 'b', a.progress, 'user-2');
    b.meta = { ...a.meta, deviceId: 'b' }; // meta from user-1
    expect(await b.sync.sync()).toBe('merged');
    expect(b.meta.userId).toBe('user-2');
    expect(b.progress.currency).toBe(510); // no shared base: both sides count
  });

  it('corrupted remote data is repaired before merging', async () => {
    const cloud = new FakeCloud();
    cloud.save = { progress: { version: 2, missions: { 'b-speed': { completed: 'yes' } }, currency: -5, theme: 'neon' }, revision: 1, device: 'x', updatedAt: '' };
    const a = new Device(cloud, 'a');
    a.earn(20);
    expect(await a.sync.sync()).toBe('merged');
    expect(a.progress.currency).toBe(20);
    expect(a.progress.theme).toBe('dark');
    expect(a.progress.missions).toEqual({});
  });

  it('network errors propagate (the caller retries later) and leave everything unchanged', async () => {
    const cloud = new FakeCloud();
    const a = new Device(cloud, 'a');
    a.earn(5);
    cloud.offline = true;
    await expect(a.sync.sync()).rejects.toThrow('offline');
    expect(a.meta.revision).toBe(0);
    expect(a.progress.currency).toBe(5);
  });
});
