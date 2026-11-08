import { useState } from 'react';
import { velocity, displacement, acceleration, ohmCurrent, pendulumPeriod, rangeProjectile } from '../../game/engine/physics';

interface Props {
  kind: string;
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      {label}: {value}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}

function MotionSim() {
  const [u, setU] = useState(0);
  const [a, setA] = useState(2);
  const [t, setT] = useState(3);
  const v = velocity(u, a, t);
  const s = displacement(u, a, t);
  return (
    <div className="glass p-4 space-y-2">
      <h4 className="font-semibold">Motion Simulator</h4>
      <Slider label="Initial velocity u (m/s)" value={u} min={-10} max={10} step={0.5} onChange={setU} />
      <Slider label="Acceleration a (m/s²)" value={a} min={-5} max={5} step={0.5} onChange={setA} />
      <Slider label="Time t (s)" value={t} min={0} max={10} step={0.5} onChange={setT} />
      <div className="text-sm mt-2">Final velocity v = {v.toFixed(2)} m/s · Displacement s = {s.toFixed(2)} m</div>
    </div>
  );
}

function ForceSim() {
  const [m, setM] = useState(5);
  const [F, setF] = useState(10);
  const a = acceleration(F, m);
  return (
    <div className="glass p-4 space-y-2">
      <h4 className="font-semibold">Force Diagram</h4>
      <Slider label="Mass m (kg)" value={m} min={1} max={20} step={1} onChange={setM} />
      <Slider label="Force F (N)" value={F} min={0} max={50} step={1} onChange={setF} />
      <div className="text-sm mt-2">Acceleration a = F/m = {a.toFixed(2)} m/s²</div>
    </div>
  );
}

function CircuitSim() {
  const [V, setV] = useState(9);
  const [R, setR] = useState(10);
  const I = ohmCurrent(V, R);
  return (
    <div className="glass p-4 space-y-2">
      <h4 className="font-semibold">Circuit (Ohm's Law)</h4>
      <Slider label="Voltage V (V)" value={V} min={0} max={24} step={1} onChange={setV} />
      <Slider label="Resistance R (Ω)" value={R} min={1} max={50} step={1} onChange={setR} />
      <div className="text-sm mt-2">Current I = V/R = {isFinite(I) ? I.toFixed(3) : '∞'} A</div>
    </div>
  );
}

function PendulumSim() {
  const [L, setL] = useState(1);
  const T = pendulumPeriod(L);
  return (
    <div className="glass p-4 space-y-2">
      <h4 className="font-semibold">Pendulum</h4>
      <Slider label="Length L (m)" value={L} min={0.1} max={5} step={0.1} onChange={setL} />
      <div className="text-sm mt-2">Period T = 2π√(L/g) = {T.toFixed(3)} s</div>
    </div>
  );
}

function ProjectileSim() {
  const [v0, setV0] = useState(20);
  const [theta, setTheta] = useState(45);
  const R = rangeProjectile(v0, theta);
  return (
    <div className="glass p-4 space-y-2">
      <h4 className="font-semibold">Projectile Cannon</h4>
      <Slider label="Speed v0 (m/s)" value={v0} min={5} max={40} step={1} onChange={setV0} />
      <Slider label="Angle θ (°)" value={theta} min={0} max={90} step={1} onChange={setTheta} />
      <div className="text-sm mt-2">Range = {R.toFixed(2)} m</div>
    </div>
  );
}

export function InteractivePanel({ kind }: Props) {
  switch (kind) {
    case 'motion-simulator':
      return <MotionSim />;
    case 'force-diagram':
      return <ForceSim />;
    case 'circuit-builder':
      return <CircuitSim />;
    case 'pendulum-spring':
      return <PendulumSim />;
    case 'projectile-cannon':
      return <ProjectileSim />;
    default:
      return (
        <div className="glass p-4">
          <h4 className="font-semibold capitalize">{kind.replace(/-/g, ' ')}</h4>
          <p className="opacity-70 text-sm mt-1">Interactive simulation (coming soon).</p>
        </div>
      );
  }
}
