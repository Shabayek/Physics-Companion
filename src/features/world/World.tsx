import { useParams, Link } from 'react-router-dom';
import { useGameStore } from '../../store/useGameStore';
import { missionsByWorld } from '../../data/missions';
import { bossForWorld } from '../../data/bosses';
import { bossUnlockStatus } from '../../game/engine/boss';
import { formatDuration } from '../../lib/time';
import type { Difficulty } from '../../types';

export default function World() {
  const { difficulty } = useParams();
  const progress = useGameStore((s) => s.progress);
  const ms = missionsByWorld(difficulty ?? '');
  const boss = bossForWorld(difficulty ?? '');
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="btn">← Back</Link>
        <h1 className="text-2xl font-bold capitalize">{difficulty} World</h1>
      </div>
      {boss && <BossCard world={boss.world} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ms.map((m) => {
          const mp = progress.missions[m.id];
          return (
            <div key={m.id} className="glass p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{m.title}</h3>
                <span className="text-sm opacity-70" aria-label={`${mp?.stars ?? 0} of 3 stars`}>{mp?.stars ?? 0}★</span>
              </div>
              <p className="opacity-70 text-sm mt-1">{m.concept}</p>
              <p className="opacity-80 text-xs mt-1">{m.zone}</p>
              <Link to={`/mission/${m.id}`} className="btn primary mt-3 inline-block" aria-label={`${mp?.completed ? 'Replay' : 'Start'} ${m.title}`}>
                {mp?.completed ? 'Replay' : 'Start'}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BossCard({ world }: { world: Difficulty }) {
  const progress = useGameStore((s) => s.progress);
  const boss = bossForWorld(world);
  if (!boss) return null;
  const status = bossUnlockStatus(progress, world);
  const record = progress.bosses[boss.id];
  return (
    <section className={`glass boss-card p-5 flex items-center gap-4 ${status.unlocked ? '' : 'opacity-70'}`} aria-label={`Boss: ${boss.name}`}>
      <div className={`text-5xl ${status.unlocked ? '' : 'grayscale'}`} aria-hidden="true">{boss.emoji}</div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-bold">
          {boss.name} {record?.defeated && <span className="text-sm font-normal">✓ Defeated</span>}
        </h2>
        {status.unlocked ? (
          <p className="text-sm opacity-80">
            {record?.defeated
              ? `Best: ${'❤️'.repeat(record.bestHeartsLeft)} in ${formatDuration(record.bestTimeMs ?? 0)}`
              : 'The world boss has appeared! Defeat it to unlock the next world.'}
          </p>
        ) : (
          <>
            <p className="text-sm opacity-80">
              Complete {status.needed} missions to challenge the boss ({status.done}/{status.needed}).
            </p>
            <div
              className="progress mt-2"
              role="progressbar"
              aria-label="Boss unlock progress"
              aria-valuemin={0}
              aria-valuemax={status.needed}
              aria-valuenow={Math.min(status.done, status.needed)}
            >
              <div style={{ width: `${(Math.min(status.done, status.needed) / status.needed) * 100}%` }} />
            </div>
          </>
        )}
      </div>
      {status.unlocked ? (
        <Link to={`/boss/${world}`} className="btn primary">
          {record?.defeated ? 'Rematch' : 'Challenge'}
        </Link>
      ) : (
        <span className="btn" aria-disabled="true">🔒 Locked</span>
      )}
    </section>
  );
}
