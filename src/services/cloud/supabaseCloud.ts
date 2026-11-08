// Supabase adapters for cloud save (RPCs) and account linking (Supabase Auth).
import type { Progress } from '../../types';
import type { SupabaseLike } from '../leaderboard/supabaseLeaderboard';
import { ensureSession } from '../backend/session';
import type { CloudApi, PutResult, RemoteSave } from './sync';
import { CLOUD_RULES, saveSizeBytes } from './rules';

interface AuthError {
  message: string;
}

export interface SupabaseAccountClient extends SupabaseLike {
  auth: SupabaseLike['auth'] & {
    getUser(): Promise<{ data: { user: { id: string; email?: string | null; new_email?: string | null; is_anonymous?: boolean } | null }; error: AuthError | null }>;
    updateUser(attrs: { email: string }, options?: { emailRedirectTo?: string }): Promise<{ error: AuthError | null }>;
    signInWithOtp(credentials: { email: string; options?: { emailRedirectTo?: string; shouldCreateUser?: boolean } }): Promise<{ error: AuthError | null }>;
    onAuthStateChange(callback: (event: string, session: { user: { id: string } } | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
}

export interface AccountInfo {
  id: string;
  email: string | null;
  /** Email waiting for confirmation (linking in progress). */
  pendingEmail: string | null;
  isAnonymous: boolean;
}

export interface AccountApi {
  currentAccount(): Promise<AccountInfo | null>;
  /** Links an email to the current (anonymous) account. Returns an error message or null. */
  linkEmail(email: string, redirectTo: string): Promise<string | null>;
  /** Sends a magic sign-in link for an existing account. Returns an error message or null. */
  signInWithEmail(email: string, redirectTo: string): Promise<string | null>;
  onUserChange(callback: (userId: string | null) => void): () => void;
}

export class CloudNetworkError extends Error {}

export function supabaseCloudApi(client: SupabaseAccountClient): CloudApi & AccountApi {
  const rpc = async <T>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new CloudNetworkError(`${fn}: ${error.message}`);
    return data as T;
  };
  return {
    ensureSession: () => ensureSession(client),
    async getSave(): Promise<RemoteSave | null> {
      const row = await rpc<{ progress: unknown; revision: number; device: string; updated_at: string } | null>('get_cloud_save');
      return row ? { progress: row.progress, revision: Number(row.revision), device: row.device, updatedAt: row.updated_at } : null;
    },
    async putSave(progress: Progress, expectedRevision: number, device: string): Promise<PutResult> {
      if (saveSizeBytes(progress) > CLOUD_RULES.MAX_SAVE_BYTES) return { status: 'error', code: 'too_large' };
      const r = await rpc<{ status: string; revision?: number; progress?: unknown; code?: string }>('put_cloud_save', {
        p_progress: progress,
        p_expected_revision: expectedRevision,
        p_device: device,
      });
      if (r.status === 'ok') return { status: 'ok', revision: Number(r.revision) };
      if (r.status === 'conflict') return { status: 'conflict', revision: Number(r.revision ?? 0), progress: r.progress ?? null };
      return { status: r.status === 'retry' ? 'retry' : 'error', ...(r.code ? { code: r.code } : {}) };
    },
    async deleteSave(): Promise<void> {
      await rpc('delete_cloud_save');
    },
    async currentAccount(): Promise<AccountInfo | null> {
      const { data: session } = await client.auth.getSession();
      if (!session.session) return null;
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      const u = data.user;
      return { id: u.id, email: u.email || null, pendingEmail: u.new_email || null, isAnonymous: u.is_anonymous ?? !u.email };
    },
    async linkEmail(email: string, redirectTo: string): Promise<string | null> {
      await ensureSession(client);
      const { error } = await client.auth.updateUser({ email }, { emailRedirectTo: redirectTo });
      return error ? error.message : null;
    },
    async signInWithEmail(email: string, redirectTo: string): Promise<string | null> {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
      return error ? error.message : null;
    },
    onUserChange(callback: (userId: string | null) => void): () => void {
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(session?.user.id ?? null));
      return () => data.subscription.unsubscribe();
    },
  };
}
