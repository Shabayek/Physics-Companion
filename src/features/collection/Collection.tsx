import { Link } from 'react-router-dom';
import { useGameStore } from '../../store/useGameStore';
import { ALL_BADGES, describeBadge, type BadgeInfo, type BadgeSource } from '../../data/badges';
import { LAWS } from '../../data/laws';
import { CONSTANTS } from '../../data/constants';

const SECTIONS: { source: BadgeSource; title: string }[] = [
  { source: 'achievement', title: 'Achievement badges' },
  { source: 'boss', title: 'Boss badges' },
  { source: 'mission', title: 'Mission badges' },
];

export default function Collection() {
  const collection = useGameStore((s) => s.progress.collection);
  const owned = new Set(collection.badges);
  const unknown = collection.badges.filter((id) => !describeBadge(id));
  const earnedTotal = ALL_BADGES.filter((b) => owned.has(b.id)).length;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Collection</h1>
      <p className="opacity-80">
        Badges earned: <span className="font-semibold">{earnedTotal}</span> of {ALL_BADGES.length}
      </p>

      {SECTIONS.map(({ source, title }) => {
        const badges = ALL_BADGES.filter((b) => b.source === source);
        const earned = badges.filter((b) => owned.has(b.id)).length;
        return (
          <section key={source} className="glass p-4 space-y-3" aria-label={title}>
            <h2 className="font-semibold">
              {title} ({earned}/{badges.length})
            </h2>
            <ul className="badge-grid">
              {badges.map((b) => (
                <BadgeTile key={b.id} badge={b} earned={owned.has(b.id)} />
              ))}
            </ul>
          </section>
        );
      })}

      {unknown.length > 0 && (
        <section className="glass p-4" aria-label="Other badges">
          <h2 className="font-semibold">Other badges</h2>
          <p className="text-sm opacity-70">{unknown.join(', ')}</p>
        </section>
      )}

      <section className="glass p-4 space-y-1" aria-label="Codex">
        <h2 className="font-semibold">Codex</h2>
        <p className="text-sm text-muted">
          Laws: {LAWS.filter((l) => collection.laws.includes(l.id)).length}/{LAWS.length} · Constants:{' '}
          {CONSTANTS.filter((c) => collection.constants.includes(c.id)).length}/{CONSTANTS.length} ·{' '}
          <Link to="/codex">Open the Codex</Link>
        </p>
      </section>
    </div>
  );
}

function BadgeTile({ badge, earned }: { badge: BadgeInfo; earned: boolean }) {
  const hidden = badge.secret && !earned;
  const name = hidden ? 'Secret badge' : badge.name;
  return (
    <li className={`badge-tile ${earned ? 'earned' : 'missing'} ${badge.tier ? `tier-${badge.tier}` : ''}`} title={hidden ? undefined : badge.description}>
      <span className="text-3xl" aria-hidden="true">{hidden ? '❔' : badge.icon}</span>
      <span className="text-xs font-semibold text-center">{name}</span>
      <span className="sr-only">{earned ? 'earned' : 'not earned yet'}</span>
    </li>
  );
}
