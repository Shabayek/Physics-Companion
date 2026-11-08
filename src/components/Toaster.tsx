import { useEffect, useState } from 'react';
import { useGameStore, type Toast } from '../store/useGameStore';

const AUTO_DISMISS_MS = 5000;
/** Toasts shown at once; the rest wait in the queue (oldest shown first). */
export const VISIBLE_TOASTS = 2;

const ICONS: Record<Toast['kind'], string> = {
  reward: '✨',
  unlock: '🔓',
  achievement: '🏆',
  streak: '🔥',
  info: 'ℹ️',
  error: '⚠️',
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useGameStore((s) => s.dismissToast);
  // Auto-dismiss pauses while the toast is hovered or focused, so it never disappears mid-read.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    // Errors stay until dismissed so they cannot be missed.
    if (toast.kind === 'error' || paused) return;
    const handle = window.setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(handle);
  }, [toast.id, toast.kind, dismiss, paused]);

  return (
    <li
      className={`toast glass toast-${toast.kind}`}
      role={toast.kind === 'error' ? 'alert' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span aria-hidden="true" className="text-lg leading-none">{ICONS[toast.kind]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{toast.title}</p>
        {toast.message && <p className="text-sm opacity-80">{toast.message}</p>}
      </div>
      <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label={`Dismiss: ${toast.title}`}>
        ×
      </button>
    </li>
  );
}

/** Notification stack. A polite live region so screen readers announce rewards. */
export function Toaster() {
  const toasts = useGameStore((s) => s.toasts).slice(0, VISIBLE_TOASTS);
  return (
    <section className="toaster" aria-live="polite" aria-relevant="additions" aria-label="Notifications">
      <ul className="flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </ul>
    </section>
  );
}
