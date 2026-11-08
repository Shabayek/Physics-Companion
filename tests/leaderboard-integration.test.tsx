import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useGameStore } from '../src/store/useGameStore';
import { initLeaderboard, setLeaderboardService } from '../src/services/leaderboard';
import { useOnlineStore } from '../src/services/leaderboard/onlineStore';
import { LocalLeaderboard } from '../src/services/leaderboard/localLeaderboard';
import { NetworkError } from '../src/services/leaderboard/supabaseLeaderboard';
import LeaderboardPage from '../src/features/leaderboard/LeaderboardPage';
import type { LeaderboardEntry, LeaderboardService, PlayerProfile, ScoreSubmission, SubmitResult } from '../src/services/leaderboard/types';
import type { GameEvent } from '../src/game/engine/events';
import { simulateChallenge } from './helpers/challenge';

class FakeOnline implements LeaderboardService {
  readonly mode = 'online' as const;
  profile: PlayerProfile | null = null;
  sent: ScoreSubmission[] = [];
  offline = false;
  deleted = false;
  board: LeaderboardEntry[] = [];
  me: LeaderboardEntry | null = null;
  async getProfile() { return this.profile; }
  async saveProfile(p: PlayerProfile) {
    if (p.displayName === 'Taken Name') return { ok: false as const, code: 'name_taken' };
    this.profile = p;
    return { ok: true as const, profile: p };
  }
  async submit(s: ScoreSubmission): Promise<SubmitResult> {
    if (this.offline) throw new NetworkError('offline');
    this.sent.push(s);
    return { status: 'accepted', rank: 7 };
  }
  async getBoard() { return this.board; }
  async getMyRank() { return this.me; }
  async deleteMyData() { this.deleted = true; this.profile = null; }
}

function challengeEvent(timeMs = 3000, seed = 'x'): GameEvent {
  const { inputs } = simulateChallenge('sprint', 'standard', 'beginner', seed, () => ({ correct: true, timeMs }));
  return { type: 'CHALLENGE_FINISHED', mode: 'sprint', timing: 'standard', tier: 'beginner', seed, answers: inputs, endReason: 'quit' };
}

let cleanup: () => void = () => undefined;
beforeEach(() => {
  localStorage.clear();
  useGameStore.getState().reset();
});
afterEach(() => {
  cleanup();
  setLeaderboardService(null);
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('leaderboard ← game events', () => {
  it('online: nothing is uploaded until the player joins; then runs are submitted', async () => {
    const service = new FakeOnline();
    setLeaderboardService(service);
    cleanup = initLeaderboard();
    await settle();
    useGameStore.getState().dispatch(challengeEvent());
    await settle();
    expect(service.sent).toHaveLength(0);
    expect(useOnlineStore.getState().last).toMatchObject({ kind: 'skipped', code: 'no_profile' });

    service.profile = { displayName: 'Ada', kidMode: false, isPublic: true };
    useOnlineStore.setState({ profileStatus: 'unknown' });
    useGameStore.getState().dispatch(challengeEvent(3000, 'y'));
    await waitFor(() => expect(service.sent).toHaveLength(1));
    expect(service.sent[0]).toMatchObject({ board: 'challenge:sprint:standard', seed: 'y', answered: 10, correct: 10 });
    expect(useOnlineStore.getState()).toMatchObject({ pending: 0, last: { kind: 'accepted', rank: 7 } });
  });

  it('implausible runs are not sent', async () => {
    const service = new FakeOnline();
    service.profile = { displayName: 'Ada', kidMode: false, isPublic: true };
    setLeaderboardService(service);
    cleanup = initLeaderboard();
    await settle();
    useGameStore.getState().dispatch(challengeEvent(100));
    await settle();
    expect(service.sent).toHaveLength(0);
    expect(useOnlineStore.getState().last).toMatchObject({ kind: 'rejected', code: 'implausible' });
  });

  it('offline: runs wait in the queue and upload when the connection returns', async () => {
    const service = new FakeOnline();
    service.profile = { displayName: 'Ada', kidMode: false, isPublic: true };
    service.offline = true;
    setLeaderboardService(service);
    cleanup = initLeaderboard();
    await settle();
    useGameStore.getState().dispatch(challengeEvent(3000, 'a'));
    useGameStore.getState().dispatch(challengeEvent(3000, 'b'));
    await waitFor(() => expect(useOnlineStore.getState().pending).toBe(2));
    service.offline = false;
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(service.sent.map((s) => s.seed)).toEqual(['a', 'b']));
    expect(useOnlineStore.getState().pending).toBe(0);
  });

  it('regression: offline after a reload uses the cached profile, so runs are queued (not lost)', async () => {
    const service = new FakeOnline();
    setLeaderboardService(service);
    const { saveProfile } = await import('../src/services/leaderboard');
    await saveProfile({ displayName: 'Ada', kidMode: false, isPublic: true }); // caches the profile
    // "Reload" while the server is unreachable.
    service.offline = true;
    service.getProfile = async () => {
      throw new NetworkError('offline');
    };
    setLeaderboardService(service);
    cleanup = initLeaderboard();
    await waitFor(() => expect(useOnlineStore.getState()).toMatchObject({ offline: true, profile: { displayName: 'Ada' } }));
    useGameStore.getState().dispatch(challengeEvent(3000, 'q'));
    await waitFor(() => expect(useOnlineStore.getState().pending).toBe(1));
    expect(useOnlineStore.getState().last?.kind).not.toBe('skipped');
  });

  it('local mode: runs go straight to the personal board', async () => {
    const local = new LocalLeaderboard(localStorage);
    setLeaderboardService(local);
    cleanup = initLeaderboard();
    await settle();
    useGameStore.getState().dispatch(challengeEvent());
    await waitFor(async () => expect(await local.getBoard('challenge:sprint:standard', 'all')).toHaveLength(1));
  });
});

describe('LeaderboardPage', () => {
  it('offline mode explains itself and shows personal runs', async () => {
    const local = new LocalLeaderboard(localStorage);
    await local.submit({ clientId: 'client-0001', kind: 'challenge', board: 'challenge:blitz:standard', score: 123, timeMs: 50000, correct: 9, answered: 9, seed: 's', log: [], finishedAt: Date.now() });
    setLeaderboardService(local);
    render(<MemoryRouter><LeaderboardPage /></MemoryRouter>);
    expect(screen.getByTestId('leaderboard-mode')).toHaveTextContent('Offline mode');
    const table = await screen.findByRole('table', { name: 'Leaderboard' });
    expect(within(table).getByText('123')).toBeInTheDocument();
    expect(within(table).getByText('You')).toBeInTheDocument();
  });

  it('online: join (name validation + taken), board with my row, my rank outside the top, delete data', async () => {
    const user = userEvent.setup();
    const service = new FakeOnline();
    service.board = [
      { rank: 1, displayName: 'Bob', score: 200, timeMs: 1, createdAt: '2026-11-07T10:00:00Z', isMe: false },
      { rank: 2, displayName: 'Cyd', score: 150, timeMs: 1, createdAt: '2026-11-07T10:00:00Z', isMe: false },
    ];
    service.me = { rank: 42, displayName: 'Ada Lovelace', score: 20, timeMs: 1, createdAt: '2026-11-07T10:00:00Z', isMe: true };
    setLeaderboardService(service);
    render(<MemoryRouter><LeaderboardPage /></MemoryRouter>);

    const form = await screen.findByRole('form', { name: 'Join the leaderboard' });
    const input = within(form).getByRole('textbox', { name: 'Display name' });
    await user.type(input, 'Al');
    await user.click(within(form).getByRole('button', { name: 'Join' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Names must be 3–24 characters.');
    await user.clear(input);
    await user.type(input, 'Taken Name');
    await user.click(within(form).getByRole('button', { name: 'Join' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('That name is already taken.');
    await user.clear(input);
    await user.type(input, 'Ada Lovelace');
    await user.click(within(form).getByRole('button', { name: 'Join' }));

    const panel = await screen.findByRole('region', { name: 'Your leaderboard profile' });
    expect(panel).toHaveTextContent('Playing as Ada Lovelace · visible on public boards');
    const table = await screen.findByRole('table', { name: 'Leaderboard' });
    expect(within(table).getByText('Bob')).toBeInTheDocument();
    const mine = within(table).getByText('Ada Lovelace (you)').closest('tr');
    expect(mine).toHaveTextContent('#42');

    await user.click(within(panel).getByRole('button', { name: 'Delete my online data' }));
    await user.click(within(panel).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(service.deleted).toBe(true));
    expect(await screen.findByRole('form', { name: 'Join the leaderboard' })).toBeInTheDocument();
  });

  it('Kid mode: generated nicknames only', async () => {
    const user = userEvent.setup();
    useGameStore.getState().setAgeMode('kid');
    const service = new FakeOnline();
    setLeaderboardService(service);
    render(<MemoryRouter><LeaderboardPage /></MemoryRouter>);
    const form = await screen.findByRole('form', { name: 'Join the leaderboard' });
    expect(within(form).queryByRole('textbox')).not.toBeInTheDocument();
    const first = within(form).getByTestId('nickname').textContent;
    await user.click(within(form).getByRole('button', { name: '🎲 Another nickname' }));
    expect(within(form).getByTestId('nickname').textContent).not.toBe(first);
    await user.click(within(form).getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(service.profile?.kidMode).toBe(true));
    expect(service.profile?.displayName).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d{1,2}$/);
  });
});
