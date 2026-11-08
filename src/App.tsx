import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useGameStore } from './store/useGameStore';
import { TopBar } from './components/TopBar';
import { Toaster } from './components/Toaster';
import Home from './features/home/Home';
import { initLeaderboard } from './services/leaderboard';
import { initCloudSync } from './services/cloud';

// Route-level code splitting: every page except Home is loaded on demand.
const World = lazy(() => import('./features/world/World'));
const MissionPage = lazy(() => import('./features/mission/MissionPage'));
const BossPage = lazy(() => import('./features/boss/BossPage'));
const DailyPage = lazy(() => import('./features/daily/DailyPage'));
const ChallengePage = lazy(() => import('./features/challenge/ChallengePage'));
const LeaderboardPage = lazy(() => import('./features/leaderboard/LeaderboardPage'));
const Lab = lazy(() => import('./features/lab/Lab'));
const Codex = lazy(() => import('./features/codex/Codex'));
const Collection = lazy(() => import('./features/collection/Collection'));
const Achievements = lazy(() => import('./features/achievements/Achievements'));
const Profile = lazy(() => import('./features/profile/Profile'));
const SettingsPage = lazy(() => import('./features/settings/Settings'));

const APP_NAME = 'Physics Companion';

/**
 * Accessibility for a single-page app: after each navigation, move focus to the main content (so
 * screen readers and keyboard users start at the new page) and keep the document title in sync with
 * the page's main heading (WCAG 2.4.2).
 */
function RouteEffects({ mainRef }: { mainRef: React.RefObject<HTMLElement | null> }) {
  const location = useLocation();
  // Compare with the previous path (not a "first run" flag, which StrictMode's double effects defeat).
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    mainRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [location.pathname, mainRef]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const update = () => {
      const heading = main.querySelector('h1')?.textContent?.trim();
      document.title = heading && heading !== APP_NAME ? `${heading} · ${APP_NAME}` : APP_NAME;
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [mainRef]);

  return null;
}

export default function App() {
  const theme = useGameStore((s) => s.progress.theme);
  const reducedMotion = useGameStore((s) => s.progress.settings.reducedMotion);
  const textSize = useGameStore((s) => s.progress.settings.textSize);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => initLeaderboard(), []);
  useEffect(() => initCloudSync(), []);
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion);
  }, [reducedMotion]);
  useEffect(() => {
    const root = document.documentElement.classList;
    root.remove('text-size-sm', 'text-size-md', 'text-size-lg');
    root.add(`text-size-${textSize}`);
  }, [textSize]);
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark', 'high-contrast');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <a href="#main" className="skip-link">Skip to main content</a>
      <TopBar />
      <main id="main" ref={mainRef} tabIndex={-1} className="px-3 pb-6">
        <RouteEffects mainRef={mainRef} />
        <Suspense fallback={<p role="status" className="max-w-3xl mx-auto p-6 opacity-80">Loading…</p>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/world/:difficulty" element={<World />} />
            <Route path="/mission/:id" element={<MissionPage />} />
            <Route path="/boss/:world" element={<BossPage />} />
            <Route path="/daily" element={<DailyPage />} />
            <Route path="/challenge" element={<ChallengePage />} />
            <Route path="/challenge/:mode" element={<ChallengePage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/lab" element={<Lab />} />
            <Route path="/codex" element={<Codex />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <Toaster />
    </BrowserRouter>
  );
}
