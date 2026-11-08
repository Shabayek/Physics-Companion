import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultProgress, migrateProgress } from '../game/engine/progress';
import { applyEvent, type EventResult, type GameEvent, type GameNotice } from '../game/engine/events';
import { evaluateAchievements } from '../game/engine/achievements';
import { systemClock, type Clock } from '../lib/time';
import type { Progress, Settings, Theme, AgeMode } from '../types';

export interface Toast extends GameNotice {
  id: number;
}

/** Max toasts kept in the queue (the Toaster shows a few at a time); older ones beyond this are dropped. */
export const MAX_TOASTS = 8;

interface GameStore {
  progress: Progress;
  /** Transient (not persisted) notifications shown as toasts. */
  toasts: Toast[];
  /** Routes a gameplay event through the engine, applies it, and queues its notices. */
  dispatch: (event: GameEvent) => EventResult;
  notify: (notice: GameNotice) => void;
  dismissToast: (id: number) => void;
  setProgress: (p: Progress) => void;
  updateProgress: (fn: (p: Progress) => Progress) => void;
  setTheme: (t: Theme) => void;
  setAgeMode: (m: AgeMode) => void;
  setSettings: (s: Partial<Settings>) => void;
  reset: () => void;
}

let clock: Clock = systemClock;
/** Replace the clock used for dispatched events (tests / dev tools). */
export function setGameClock(next: Clock): void {
  clock = next;
}

/** Current time according to the game clock. Use in event handlers, not during render. */
export function gameNow(): number {
  return clock.now();
}

type GameEventListener = (event: GameEvent, result: EventResult) => void;
const listeners = new Set<GameEventListener>();

/** Side effects (e.g. leaderboard submissions) subscribe here; the reducer itself stays pure. */
export function subscribeGameEvents(listener: GameEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let toastSeq = 0;
const withToasts = (current: Toast[], notices: GameNotice[]): Toast[] =>
  [...current, ...notices.map((n) => ({ ...n, id: ++toastSeq }))].slice(-MAX_TOASTS);

/**
 * Awards achievements already earned by a loaded/imported save (e.g. progress made before
 * achievements existed). Returns the updated progress and at most one summary notice.
 */
function withRetroactiveAchievements(progress: Progress): { progress: Progress; notices: GameNotice[] } {
  const { progress: next, unlocked } = evaluateAchievements(progress, clock.now());
  if (unlocked.length === 0) return { progress, notices: [] };
  const quanta = unlocked.reduce((sum, a) => sum + a.quanta, 0);
  return {
    progress: next,
    notices: [
      {
        kind: 'achievement',
        title: unlocked.length === 1 ? `Achievement unlocked: ${unlocked[0]?.title}` : `${unlocked.length} achievements unlocked for your progress so far!`,
        ...(quanta > 0 ? { message: `+${quanta} Quanta` } : {}),
      },
    ],
  };
}

export const STORAGE_KEY = 'physics-companion-progress';

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      progress: defaultProgress(),
      toasts: [],
      dispatch: (event) => {
        const result = applyEvent(get().progress, event, { now: clock.now() });
        set((state) => ({ progress: result.progress, toasts: withToasts(state.toasts, result.notices) }));
        for (const listener of listeners) {
          try {
            listener(event, result);
          } catch (e) {
            console.error('Game event listener failed', e);
          }
        }
        return result;
      },
      notify: (notice) => set((state) => ({ toasts: withToasts(state.toasts, [notice]) })),
      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
      setProgress: (p) =>
        set((state) => {
          const { progress, notices } = withRetroactiveAchievements(p);
          return { progress, toasts: withToasts(state.toasts, notices) };
        }),
      updateProgress: (fn) => set((state) => ({ progress: fn(state.progress) })),
      setTheme: (t) => set((state) => ({ progress: { ...state.progress, theme: t } })),
      setAgeMode: (m) => set((state) => ({ progress: { ...state.progress, ageMode: m } })),
      setSettings: (s) =>
        set((state) => ({
          progress: { ...state.progress, settings: { ...state.progress.settings, ...s } },
        })),
      reset: () => set({ progress: defaultProgress() }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      // Runs when the stored version is older; `merge` below does the actual work.
      migrate: (persisted) => persisted as { progress: Progress },
      // Always validate/upgrade what comes out of storage, even for the same version,
      // so fields added later get defaults and corrupted data is repaired.
      merge: (persisted, current) => {
        const stored = (persisted as { progress?: unknown } | undefined)?.progress;
        if (stored === undefined) return current;
        const { progress, notices } = withRetroactiveAchievements(migrateProgress(stored));
        return { ...current, progress, toasts: withToasts(current.toasts, notices) };
      },
      partialize: (state) => ({ progress: state.progress }),
    },
  ),
);

// Zustand only writes to storage on `set`. Persist whatever hydration changed (migrations, repairs,
// retroactive achievements) right away, so it is not redone — and re-announced — on every load.
useGameStore.setState((state) => ({ progress: state.progress }));
