import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CloudSavePanel } from '../src/features/profile/CloudSavePanel';
import { initCloudSync, setCloudApi, useCloudStore, CLOUD_META_KEY, SYNC_DEBOUNCE_MS } from '../src/services/cloud';
import type { CloudApi, PutResult, RemoteSave } from '../src/services/cloud/sync';
import type { AccountApi, AccountInfo } from '../src/services/cloud/supabaseCloud';
import { useGameStore } from '../src/store/useGameStore';
import { defaultProgress, recordMission } from '../src/game/engine/progress';
import type { Progress } from '../src/types';

class FakeCloudApi implements CloudApi, AccountApi {
  save: RemoteSave | null = null;
  account: AccountInfo = { id: 'user-1', email: null, pendingEmail: null, isAnonymous: true };
  linked: { email: string; redirect: string }[] = [];
  signIns: string[] = [];
  async ensureSession() { return 'user-1'; }
  async getSave() { return this.save ? structuredClone(this.save) : null; }
  async putSave(progress: Progress, expected: number, device: string): Promise<PutResult> {
    const current = this.save?.revision ?? 0;
    if (expected !== current) return { status: 'conflict', revision: current, progress: this.save?.progress ?? null };
    this.save = { progress: structuredClone(progress), revision: current + 1, device, updatedAt: '' };
    return { status: 'ok', revision: current + 1 };
  }
  async deleteSave() { this.save = null; }
  async currentAccount() { return this.account; }
  async linkEmail(email: string, redirect: string) {
    this.linked.push({ email, redirect });
    this.account = { ...this.account, pendingEmail: email };
    return null;
  }
  async signInWithEmail(email: string) {
    this.signIns.push(email);
    return null;
  }
  onUserChange() { return () => undefined; }
}

let api: FakeCloudApi;
let cleanup: () => void = () => undefined;
beforeEach(() => {
  localStorage.clear();
  useGameStore.getState().reset();
  useGameStore.setState({ toasts: [] });
  api = new FakeCloudApi();
  setCloudApi(api);
});
afterEach(() => {
  cleanup();
  cleanup = () => undefined;
  vi.useRealTimers();
  setCloudApi(null);
});

const renderPanel = () => render(<MemoryRouter><CloudSavePanel /></MemoryRouter>);

describe('cloud save panel', () => {
  it('explains when online features are not configured', () => {
    setCloudApi(null);
    useCloudStore.setState({ available: false });
    renderPanel();
    expect(screen.getByRole('region', { name: 'Cloud save' })).toHaveTextContent('not configured');
  });

  it('opt-in uploads; another device’s progress is merged on sync', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setProgress({ ...defaultProgress(), currency: 40 });
    renderPanel();
    await user.click(screen.getByRole('checkbox', { name: 'Back up my progress to the cloud' }));
    await waitFor(() => expect(screen.getByTestId('cloud-status')).toHaveTextContent('✓ Synced just now'));
    expect((api.save?.progress as Progress | undefined)?.currency).toBe(40);
    expect(JSON.parse(localStorage.getItem(CLOUD_META_KEY) ?? '{}')).toMatchObject({ enabled: true, revision: 1, userId: 'user-1' });

    // Another device uploads more progress.
    const other = { ...recordMission(api.save?.progress as Progress, 'b-magnet', 3, 50, 1), currency: 65 };
    api.save = { progress: other, revision: 2, device: 'web-other', updatedAt: '' };
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(useGameStore.getState().progress.currency).toBeGreaterThanOrEqual(65));
    expect(useGameStore.getState().progress.missions['b-magnet']?.completed).toBe(true);
    expect(useGameStore.getState().toasts.map((t) => t.title)).toContain('Progress synced');
  });

  it('link an email; Kid mode asks a grown-up first', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setAgeMode('kid');
    renderPanel();
    await user.click(screen.getByRole('checkbox', { name: 'Back up my progress to the cloud' }));
    const gate = await screen.findByRole('form', { name: 'Grown-up check: link an email' });
    const [, a, b] = /What is (\d) × (\d)\?/.exec(gate.textContent ?? '') ?? [];
    await user.type(within(gate).getByRole('textbox', { name: 'Answer' }), '1');
    await user.click(within(gate).getByRole('button', { name: 'Continue' }));
    expect(within(gate).getByRole('alert')).toHaveTextContent('ask a grown-up');
    await user.type(within(gate).getByRole('textbox', { name: 'Answer' }), String(Number(a) * Number(b)));
    await user.click(within(gate).getByRole('button', { name: 'Continue' }));

    const form = screen.getByRole('form', { name: 'Link an email' });
    await user.type(within(form).getByRole('textbox', { name: 'Email to link' }), 'not-an-email');
    await user.click(within(form).getByRole('button', { name: 'Send link' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('valid email');
    await user.clear(within(form).getByRole('textbox', { name: 'Email to link' }));
    await user.type(within(form).getByRole('textbox', { name: 'Email to link' }), 'parent@example.com');
    await user.click(within(form).getByRole('button', { name: 'Send link' }));
    await waitFor(() => expect(api.linked).toEqual([{ email: 'parent@example.com', redirect: `${window.location.origin}/profile` }]));
    expect(await screen.findByText(/Check p•••@example.com/)).toBeInTheDocument();
  });

  it('linked accounts show the email; delete cloud save turns backup off', async () => {
    const user = userEvent.setup();
    api.account = { id: 'user-1', email: 'ada@example.com', pendingEmail: null, isAnonymous: false };
    renderPanel();
    await user.click(screen.getByRole('checkbox', { name: 'Back up my progress to the cloud' }));
    expect(await screen.findByText(/Linked to/)).toHaveTextContent('Linked to a•••@example.com');
    await user.click(screen.getByRole('button', { name: 'Delete cloud save' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.save).toBeNull());
    expect(screen.getByRole('checkbox', { name: 'Back up my progress to the cloud' })).not.toBeChecked();
  });
});

describe('account changes', () => {
  it('regression: the first anonymous sign-in does not reload the profile; an account switch does', async () => {
    const leaderboard = await import('../src/services/leaderboard');
    const { useOnlineStore } = await import('../src/services/leaderboard/onlineStore');
    let getProfileCalls = 0;
    leaderboard.setLeaderboardService({
      mode: 'online',
      getProfile: async () => {
        getProfileCalls++;
        return null;
      },
      saveProfile: async () => ({ ok: false, code: 'x' }),
      submit: async () => ({ status: 'accepted' }),
      getBoard: async () => [],
      getMyRank: async () => null,
      deleteMyData: async () => undefined,
    });
    useOnlineStore.setState({ profileStatus: 'ready' });
    let emit: (id: string | null) => void = () => undefined;
    api.currentAccount = async () => null; // not signed in yet
    api.onUserChange = (cb: (id: string | null) => void) => {
      emit = cb;
      return () => undefined;
    };
    cleanup = initCloudSync();
    await waitFor(() => expect(emit).not.toBe(undefined));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    emit('anon-1'); // first anonymous sign-in (e.g. when joining the leaderboard)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(getProfileCalls).toBe(0);
    expect(useOnlineStore.getState().profileStatus).toBe('ready');
    emit('user-2'); // switched account via a magic link
    await waitFor(() => expect(getProfileCalls).toBe(1));
    expect(useOnlineStore.getState().profileStatus).toBe('ready'); // no "Connecting…" flash
    leaderboard.setLeaderboardService(null);
  });
});

describe('automatic sync', () => {
  it('progress changes are uploaded after a short debounce', async () => {
    localStorage.setItem(CLOUD_META_KEY, JSON.stringify({ enabled: true, userId: null, revision: 0, base: null, lastSyncedAt: null, deviceId: 'web-test' }));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    cleanup = initCloudSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await vi.waitFor(() => expect(api.save?.revision).toBe(1));
    useGameStore.getState().updateProgress((p) => ({ ...p, currency: p.currency + 25 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS - 100);
    });
    expect(api.save?.revision).toBe(1); // still debouncing
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await vi.waitFor(() => expect(api.save?.revision).toBe(2));
    expect((api.save?.progress as Progress | undefined)?.currency).toBe(25);
  });
});
