import { useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { defaultProgress } from '../../game/engine/progress';
import { parseProgressStrict } from '../../game/engine/schema';
import { ACHIEVEMENTS } from '../../data/achievements';
import { Link } from 'react-router-dom';
import { viewStreak } from '../../game/engine/streak';
import { toLocalDateKey } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import { CloudSavePanel } from './CloudSavePanel';

export default function Profile() {
  const progress = useGameStore((s) => s.progress);
  const setProgress = useGameStore((s) => s.setProgress);
  const reset = useGameStore((s) => s.reset);
  const notify = useGameStore((s) => s.notify);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'physics-companion-progress.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProgress = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      let data: unknown;
      try {
        data = JSON.parse(String(reader.result));
      } catch {
        notify({ kind: 'error', title: 'Import failed', message: 'The file is not valid JSON.' });
        return;
      }
      const parsed = parseProgressStrict(data);
      if (!parsed.ok) {
        notify({ kind: 'error', title: 'Import failed', message: parsed.error });
        return;
      }
      setProgress(parsed.progress);
      notify({ kind: 'info', title: 'Progress imported', message: `Welcome back, ${parsed.progress.playerName}!` });
    };
    reader.onerror = () => notify({ kind: 'error', title: 'Import failed', message: 'The file could not be read.' });
    reader.readAsText(file);
  };

  const completed = Object.values(progress.missions).filter((m) => m.completed).length;
  const streak = viewStreak(progress.streak, toLocalDateKey(useNow(60_000)));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="glass p-4 space-y-2">
        <p>Player: {progress.playerName}</p>
        <p>Missions completed: {completed}</p>
        <p>Quanta: {progress.currency}</p>
        <p>
          Achievements: {ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).length}/{ACHIEVEMENTS.length} ·{' '}
          <Link to="/achievements">View all</Link>
        </p>
        <p>Streak: {streak.days} day(s) · Longest: {progress.streak.longest}</p>
        <p>Daily challenges completed: {progress.stats.dailyChallengesCompleted}</p>
        <p>
          Questions answered: {progress.stats.questionsAnswered} · Correct: {progress.stats.questionsCorrect}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button className="btn" onClick={exportProgress}>Export Progress</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import Progress</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importProgress(file);
            e.target.value = '';
          }} />
        <button className="btn" onClick={() => { if (confirm('Reset all progress?')) reset(); }}>Reset</button>
      </div>
      <button className="btn" onClick={() => setProgress({ ...defaultProgress(progress.playerName), theme: progress.theme })}>New Game</button>
      <CloudSavePanel />
    </div>
  );
}
