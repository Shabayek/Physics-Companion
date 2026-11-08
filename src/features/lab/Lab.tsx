import { useState } from 'react';
import { InteractivePanel } from '../mission/InteractivePanel';

const KINDS = ['motion-simulator', 'force-diagram', 'circuit-builder', 'pendulum-spring', 'projectile-cannon', 'wave-lab', 'optics-bench', 'orbit-simulator'];

export default function Lab() {
  const [kind, setKind] = useState<string>(KINDS[0] ?? KINDS[1] ?? 'motion-simulator');
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Free-Play Lab</h1>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k} className={k === kind ? 'btn primary' : 'btn'} onClick={() => setKind(k)}>
            {k.replace(/-/g, ' ')}
          </button>
        ))}
      </div>
      <InteractivePanel kind={kind} />
    </div>
  );
}
