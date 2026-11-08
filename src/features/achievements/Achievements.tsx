import { useState } from 'react';
import { ACHIEVEMENTS } from '../../data/achievements';
import { achievementStatus } from '../../game/engine/achievements';
import { useGameStore } from '../../store/useGameStore';
import type { AchievementCategory, AchievementDef } from '../../types';

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  missions: 'Missions',
  mastery: 'Mastery',
  knowledge: 'Knowledge',
  bosses: 'Bosses',
  dedication: 'Dedication',
  challenge: 'Challenge',
};
const CATEGORY_ORDER: AchievementCategory[] = ['missions', 'mastery', 'knowledge', 'bosses', 'dedication', 'challenge'];

type Filter = 'all' | 'unlocked' | 'locked';

export default function Achievements() {
  const progress = useGameStore((s) => s.progress);
  const [filter, setFilter] = useState<Filter>('all');
  const statuses = ACHIEVEMENTS.map((def) => ({ def, status: achievementStatus(def, progress) }));
  const unlockedCount = statuses.filter((s) => s.status.unlocked).length;
  const quantaFromAchievements = statuses.reduce((sum, s) => sum + (s.status.unlocked ? s.def.quanta : 0), 0);
  const visible = statuses.filter((s) => (filter === 'all' ? true : filter === 'unlocked' ? s.status.unlocked : !s.status.unlocked));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Achievements</h1>
      <div className="glass p-4 space-y-2">
        <p>
          <span className="font-semibold">{unlockedCount}</span> of {ACHIEVEMENTS.length} unlocked · {quantaFromAchievements} Quanta earned from achievements
        </p>
        <div
          className="progress"
          role="progressbar"
          aria-label="Achievements unlocked"
          aria-valuemin={0}
          aria-valuemax={ACHIEVEMENTS.length}
          aria-valuenow={unlockedCount}
        >
          <div style={{ width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%` }} />
        </div>
      </div>

      <div className="flex gap-2" role="group" aria-label="Filter achievements">
        {(['all', 'unlocked', 'locked'] as const).map((f) => (
          <button key={f} className={filter === f ? 'btn primary' : 'btn'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'unlocked' ? 'Unlocked' : 'In progress'}
          </button>
        ))}
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const items = visible.filter((s) => s.def.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} aria-labelledby={`ach-${cat}`} className="space-y-2">
            <h2 id={`ach-${cat}`} className="text-lg font-semibold">
              {CATEGORY_LABEL[cat]}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map(({ def, status }) => (
                <AchievementCard key={def.id} def={def} status={status} />
              ))}
            </div>
          </section>
        );
      })}
      {visible.length === 0 && <p className="opacity-70">Nothing here yet.</p>}
    </div>
  );
}

function AchievementCard({ def, status }: { def: AchievementDef; status: ReturnType<typeof achievementStatus> }) {
  const hidden = def.secret && !status.unlocked;
  const title = hidden ? 'Secret achievement' : def.title;
  return (
    <article className={`glass p-4 flex gap-3 achievement tier-${def.tier} ${status.unlocked ? 'unlocked' : 'locked'}`} aria-label={title}>
      <div className="text-3xl w-10 shrink-0 text-center" aria-hidden="true">{hidden ? '❔' : def.icon}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{title}</h3>
          <span className={`tier-label tier-${def.tier}`}>{def.tier}</span>
        </div>
        <p className="text-sm opacity-80">{hidden ? 'Keep playing to discover this one.' : def.description}</p>
        {status.unlocked ? (
          <p className="text-xs opacity-80">
            ✓ Unlocked{status.unlockedAt ? ` on ${new Date(status.unlockedAt).toLocaleDateString()}` : ''}
            {def.quanta > 0 && ` · +${def.quanta} Quanta`}
          </p>
        ) : (
          !hidden && (
            <>
              <div
                className="progress"
                role="progressbar"
                aria-label={`${def.title} progress`}
                aria-valuemin={0}
                aria-valuemax={status.target}
                aria-valuenow={status.current}
              >
                <div style={{ width: `${status.ratio * 100}%` }} />
              </div>
              <p className="text-xs opacity-70">
                {status.current.toLocaleString('en-US')}/{status.target.toLocaleString('en-US')}
                {def.quanta > 0 && ` · Reward: ${def.quanta} Quanta`}
              </p>
            </>
          )
        )}
      </div>
    </article>
  );
}
