// Detects whether an online backend (Supabase) is configured via Vite env vars.
// Without configuration the app runs fully offline; online features (leaderboard,
// cloud save) degrade gracefully instead of failing.

export type BackendConfig =
  | { enabled: true; url: string; anonKey: string }
  | { enabled: false; reason: 'missing' | 'invalid-url' };

export interface BackendEnv {
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_ANON_KEY?: string | undefined;
}

export function readBackendConfig(env: BackendEnv): BackendConfig {
  const url = env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!url || !anonKey) return { enabled: false, reason: 'missing' };
  try {
    const parsed = new URL(url);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
      return { enabled: false, reason: 'invalid-url' };
    }
    return { enabled: true, url: parsed.origin, anonKey };
  } catch {
    return { enabled: false, reason: 'invalid-url' };
  }
}

export const backendConfig: BackendConfig = readBackendConfig(import.meta.env);

export function describeBackend(config: BackendConfig): string {
  if (config.enabled) return `Online (${new URL(config.url).hostname})`;
  return config.reason === 'missing'
    ? 'Offline mode — online features are not configured.'
    : 'Offline mode — VITE_SUPABASE_URL is not a valid https URL.';
}
