import { useGameStore } from '../../store/useGameStore';
import { backendConfig, describeBackend } from '../../services/backend/config';

export default function SettingsPage() {
  const progress = useGameStore((s) => s.progress);
  const setTheme = useGameStore((s) => s.setTheme);
  const setAgeMode = useGameStore((s) => s.setAgeMode);
  const setSettings = useGameStore((s) => s.setSettings);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="glass p-4 space-y-3">
        <label className="block">
          Theme
          <select className="ml-2 p-1 rounded bg-black/30" value={progress.theme} onChange={(e) => setTheme(e.target.value as never)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High Contrast</option>
          </select>
        </label>
        <label className="block">
          Age mode
          <select className="ml-2 p-1 rounded bg-black/30" value={progress.ageMode} onChange={(e) => setAgeMode(e.target.value as never)}>
            <option value="kid">Kid</option>
            <option value="standard">Standard</option>
          </select>
        </label>
        <label className="block">
          Text size
          <select className="ml-2 p-1 rounded bg-black/30" value={progress.settings.textSize} onChange={(e) => setSettings({ textSize: e.target.value as never })}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={progress.settings.audio} onChange={(e) => setSettings({ audio: e.target.checked })} />
          Audio
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={progress.settings.reducedMotion} onChange={(e) => setSettings({ reducedMotion: e.target.checked })} />
          Reduced motion
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={progress.settings.kidTone} onChange={(e) => setSettings({ kidTone: e.target.checked })} />
          Kid tone
        </label>
      </div>
      <div className="glass p-4 space-y-1">
        <h2 className="font-semibold">Online features</h2>
        <p className="text-sm opacity-80" data-testid="backend-status">{describeBackend(backendConfig)}</p>
      </div>
    </div>
  );
}
