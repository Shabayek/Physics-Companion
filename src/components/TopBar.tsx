import { Link, NavLink } from 'react-router-dom';
import { useGameStore } from '../store/useGameStore';
import { useNow } from '../lib/useNow';
import { toLocalDateKey } from '../lib/time';
import { viewStreak } from '../game/engine/streak';
import { useCloudStore } from '../services/cloud';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/challenge', label: 'Challenge', end: false },
  { to: '/lab', label: 'Lab', end: false },
  { to: '/codex', label: 'Codex', end: false },
  { to: '/leaderboard', label: 'Leaderboard', end: false },
  { to: '/achievements', label: 'Achievements', end: false },
  { to: '/collection', label: 'Collection', end: false },
  { to: '/profile', label: 'Profile', end: false },
  { to: '/settings', label: 'Settings', end: false },
] as const;

export function TopBar() {
  const progress = useGameStore((s) => s.progress);
  const setTheme = useGameStore((s) => s.setTheme);
  const theme = progress.theme;
  const nextTheme = theme === 'dark' ? 'light' : theme === 'light' ? 'high-contrast' : 'dark';
  const cloud = useCloudStore();
  const streak = viewStreak(progress.streak, toLocalDateKey(useNow(30_000)));
  const streakLabel = `Streak: ${streak.days} day${streak.days === 1 ? '' : 's'}${streak.atRisk ? ' — play today to keep it' : ''}`;
  return (
    <header className="topbar glass m-3 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link to="/" className="brand font-bold text-lg shrink-0"><span aria-hidden="true">⚛ </span>Physics Companion</Link>
      <nav aria-label="Main" className="topbar-nav order-last w-full lg:order-none lg:w-auto lg:flex-1">
        <ul className="flex gap-1 text-sm">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex items-center gap-2 sm:gap-3 text-sm ml-auto whitespace-nowrap">
        <Link
          to="/daily"
          className={`streak-chip ${streak.atRisk ? 'at-risk' : ''} ${streak.days === 0 ? 'cold' : ''}`}
          aria-label={streakLabel}
          title={streakLabel}
        >
          🔥 {streak.days}
        </Link>
        {cloud.available && cloud.enabled && (
          <Link
            to="/profile"
            className="cloud-chip"
            aria-label={`Cloud save: ${cloud.state === 'syncing' ? 'syncing' : cloud.state === 'synced' ? 'synced' : cloud.state === 'offline' ? 'offline' : cloud.state === 'error' ? 'sync problem' : 'on'}`}
            title="Cloud save"
          >
            {cloud.state === 'syncing' ? '☁️⟳' : cloud.state === 'error' || cloud.state === 'offline' ? '☁️⚠' : '☁️'}
          </Link>
        )}
        <span aria-label={`Worlds unlocked: ${progress.unlockedWorlds.length} of 4`}>
          <span className="hidden sm:inline">Worlds: </span>🌍 {progress.unlockedWorlds.length}/4
        </span>
        <span aria-label={`${progress.currency} Quanta`}>
          <span className="hidden sm:inline">Quanta: </span>✨ {progress.currency}
        </span>
        <button className="btn theme-btn" onClick={() => setTheme(nextTheme)} aria-label={`Theme: ${theme}. Switch to ${nextTheme}`}>
          <span aria-hidden="true">🌓</span>
          <span className="hidden sm:inline"> Theme: {theme}</span>
        </button>
      </div>
    </header>
  );
}
