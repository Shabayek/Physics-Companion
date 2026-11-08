import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'physics-companion-progress';

async function freshStore() {
  vi.resetModules();
  return (await import('../src/store/useGameStore')).useGameStore;
}

beforeEach(() => localStorage.clear());

describe('store persistence', () => {
  it('upgrades a v1 save found in localStorage on startup', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        state: {
          progress: {
            version: 1,
            playerName: 'Ada',
            ageMode: 'standard',
            theme: 'dark',
            locale: 'en',
            unlockedWorlds: ['beginner'],
            missions: { 'b-speed': { missionId: 'b-speed', completed: true, stars: 2, bestScore: 40, attempts: 1, lastPlayed: 1 } },
            collection: { constants: [], laws: [], badges: [], avatarItems: [] },
            currency: 25,
            settings: { audio: true, textSize: 'md', reducedMotion: false, kidTone: false },
            streakDays: 2,
          },
        },
      }),
    );
    const store = await freshStore();
    const p = store.getState().progress;
    expect(p.version).toBe(2);
    expect(p.playerName).toBe('Ada');
    expect(p.streak.current).toBe(2);
    expect(p.missions['b-speed']?.stars).toBe(2);
    // Retroactive achievement for the completed mission (+10 Quanta) with a single toast.
    expect(Object.keys(p.achievements)).toEqual(['first-steps']);
    expect(p.currency).toBe(25 + 10);
    expect(store.getState().toasts.map((t) => t.title)).toEqual(['Achievement unlocked: First Steps']);
  });

  it('regression: retroactive awards made while loading are persisted (not re-announced next load)', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 2, state: { progress: { version: 2, missions: { 'b-speed': { missionId: 'b-speed', completed: true, stars: 3, bestScore: 40, attempts: 1, lastPlayed: 1 } } } } }),
    );
    const first = await freshStore();
    expect(first.getState().toasts.map((t) => t.title)).toEqual(['Achievement unlocked: First Steps']);
    const second = await freshStore();
    expect(second.getState().toasts).toEqual([]);
    expect(second.getState().progress.currency).toBe(10);
  });

  it('fills in fields missing from a same-version save (future-proofing)', async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, state: { progress: { version: 2, playerName: 'Bo', currency: 5 } } }));
    const store = await freshStore();
    const p = store.getState().progress;
    expect(p.playerName).toBe('Bo');
    expect(p.currency).toBe(5);
    expect(p.stats.quizzesTaken).toBe(0);
    expect(p.challenge).toEqual({ runs: 0, best: {} });
  });

  it('survives corrupted storage', async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 2, state: { progress: 'oops' } }));
    const store = await freshStore();
    expect(store.getState().progress.playerName).toBe('Explorer');
  });

  it('persists progress but not transient toasts', async () => {
    const store = await freshStore();
    store.getState().notify({ kind: 'info', title: 'hi' });
    store.getState().setSettings({ audio: false });
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    expect(saved.version).toBe(2);
    expect(saved.state.progress.settings.audio).toBe(false);
    expect(saved.state).not.toHaveProperty('toasts');
  });
});
