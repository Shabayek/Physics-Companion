import type { SupabaseLike } from '../leaderboard/supabaseLeaderboard';

export class SessionError extends Error {}

/** Current user id, signing in anonymously on first use (the session is persisted by supabase-js). */
export async function ensureSession(client: SupabaseLike): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const signIn = await client.auth.signInAnonymously();
  if (signIn.error || !signIn.data.session) throw new SessionError(signIn.error?.message ?? 'Anonymous sign-in failed');
  return signIn.data.session.user.id;
}
