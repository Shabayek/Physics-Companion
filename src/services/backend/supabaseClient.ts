// Lazily loads supabase-js (a separate chunk) only when online features are configured.
import type { BackendConfig } from './config';
import type { SupabaseLike } from '../leaderboard/supabaseLeaderboard';

let client: Promise<SupabaseLike> | null = null;

export function getSupabaseClient(config: Extract<BackendConfig, { enabled: true }>): Promise<SupabaseLike> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'physics-companion-auth' },
    }) as unknown as SupabaseLike,
  );
  return client;
}
