import { Link } from 'react-router-dom';
import { useGameStore } from '../../store/useGameStore';
import { missionsByWorld } from '../../data/missions';
import { DIFFICULTY_ORDER } from '../../game/engine/progress';
import { bossForWorld } from '../../data/bosses';
import { DailyCard } from '../daily/DailyCard';

export default function Home() {
  const progress = useGameStore((s) => s.progress);
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="glass p-6">
        <h1 className="text-3xl font-bold mb-2">Welcome, {progress.playerName}!</h1>
        <p className="opacity-80">Explore physics from scratch across four worlds. Pick a world to begin.</p>
      </section>
      <DailyCard />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DIFFICULTY_ORDER.map((w) => {
          const unlocked = progress.unlockedWorlds.includes(w);
          const ms = missionsByWorld(w);
          const done = ms.filter((m) => progress.missions[m.id]?.completed).length;
          const boss = bossForWorld(w);
          const bossDefeated = !!boss && !!progress.bosses[boss.id]?.defeated;
          return (
            <div key={w} className="glass p-5">
              <h2 className="text-xl font-semibold capitalize">{w}</h2>
              <p className="opacity-70 text-sm">{ms.length} missions · {done} done</p>
              {boss && (
                <p className="opacity-70 text-sm">
                  {boss.emoji} {boss.name}: {bossDefeated ? 'defeated ✓' : 'undefeated'}
                </p>
              )}
              {unlocked ? (
                <Link to={`/world/${w}`} className="btn primary mt-3 inline-block">Enter</Link>
              ) : (
                <button className="btn mt-3" disabled>Locked</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
