import { useState } from 'react';
import { CONSTANTS } from '../../data/constants';
import { LAWS } from '../../data/laws';
import { useGameStore } from '../../store/useGameStore';

export default function Codex() {
  const [tab, setTab] = useState<'constants' | 'laws'>('constants');
  const collection = useGameStore((s) => s.progress.collection);
  const constantsFound = CONSTANTS.filter((c) => collection.constants.includes(c.id)).length;
  const lawsFound = LAWS.filter((l) => collection.laws.includes(l.id)).length;
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Laws & Constants Codex</h1>
      <p className="text-sm opacity-80">Defeat world bosses to discover new entries.</p>
      <div className="flex gap-2" role="tablist" aria-label="Codex sections">
        <button role="tab" aria-selected={tab === 'constants'} className={tab === 'constants' ? 'btn primary' : 'btn'} onClick={() => setTab('constants')}>
          Constants ({constantsFound}/{CONSTANTS.length})
        </button>
        <button role="tab" aria-selected={tab === 'laws'} className={tab === 'laws' ? 'btn primary' : 'btn'} onClick={() => setTab('laws')}>
          Laws ({lawsFound}/{LAWS.length})
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="tabpanel">
        {tab === 'constants'
          ? CONSTANTS.map((c) => {
              const collected = collection.constants.includes(c.id);
              return (
                <article key={c.id} className={`glass p-4 ${collected ? '' : 'locked-card'}`} aria-label={c.name}>
                  <div className="font-semibold">{c.symbol} — {c.name}</div>
                  <div className="text-sm opacity-80">{c.value} {c.unit}</div>
                  <div className="text-xs opacity-60 mt-1">{c.description}</div>
                  {!collected && <div className="text-xs mt-1">🔒 Not yet discovered</div>}
                </article>
              );
            })
          : LAWS.map((l) => {
              const collected = collection.laws.includes(l.id);
              return (
                <article key={l.id} className={`glass p-4 ${collected ? '' : 'locked-card'}`} aria-label={l.name}>
                  <div className="font-semibold">{l.name}</div>
                  <code className="block text-sm mt-1">{l.formula}</code>
                  <div className="text-xs opacity-60 mt-1">{l.description}</div>
                  {!collected && <div className="text-xs mt-1">🔒 Not yet discovered</div>}
                </article>
              );
            })}
      </div>
    </div>
  );
}
