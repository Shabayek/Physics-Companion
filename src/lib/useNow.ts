import { useEffect, useState } from 'react';
import { gameNow } from '../store/useGameStore';

/** Current game time, refreshed every `intervalMs` (for countdowns and date roll-over). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => gameNow());
  useEffect(() => {
    const tick = () => setNow(gameNow());
    const handle = window.setInterval(tick, intervalMs);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(handle);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);
  return now;
}
