// Client ↔ server contract: constants, word lists and RPC parameter names must match the SQL.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEADERBOARD_RULES } from '../src/services/leaderboard/rules';
import { KID_ADJECTIVES, KID_ANIMALS } from '../src/services/leaderboard/nicknames';
import { SupabaseLeaderboard, type SupabaseLike } from '../src/services/leaderboard/supabaseLeaderboard';
import type { ScoreSubmission } from '../src/services/leaderboard/types';
import { CLOUD_RULES } from '../src/services/cloud/rules';
import { supabaseCloudApi, type SupabaseAccountClient } from '../src/services/cloud/supabaseCloud';
import { defaultProgress } from '../src/game/engine/progress';

const ALL_RULES: Record<string, number> = { ...LEADERBOARD_RULES, ...CLOUD_RULES };

const dir = join(__dirname, '..', 'supabase', 'migrations');
const sql = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');

/** Parameter names of `public.<fn>(...)` as declared in the migration. */
function sqlParams(fn: string): string[] {
  const m = new RegExp(`create or replace function public\\.${fn}\\(([^)]*)\\)`, 'i').exec(sql);
  if (!m) throw new Error(`function ${fn} not found`);
  return (m[1] ?? '')
    .split(',')
    .map((p) => p.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
}

function fakeClient(calls: { fn: string; args: Record<string, unknown> }[]): SupabaseLike {
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
      signInAnonymously: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
      signOut: async () => ({ error: null }),
    },
    rpc: (fn, args = {}) => {
      calls.push({ fn, args });
      const data = fn === 'upsert_profile' ? { status: 'ok' } : fn === 'submit_score' ? { status: 'accepted' } : fn === 'get_my_profile' ? null : [];
      return Promise.resolve({ data, error: null });
    },
  };
}

describe('leaderboard contract', () => {
  it('every /*TAGGED*/ constant in the SQL equals the client rule (derived from the game engine)', () => {
    const tagged = [...sql.matchAll(/\/\*([A-Z_]+)\*\/\s*(\d+)/g)].map(([, name, value]) => [name as string, Number(value)] as const);
    expect(tagged.length).toBeGreaterThan(15);
    for (const [name, value] of tagged) {
      expect(ALL_RULES, `rule ${name}`).toHaveProperty(name);
      expect(ALL_RULES[name], name).toBe(value);
    }
  });

  it('Kid-mode nickname words match the server seed', () => {
    const seed = sql.slice(sql.indexOf('insert into public.kid_name_words'));
    const words = (kind: string) => [...seed.matchAll(new RegExp(`\\('${kind}', '([A-Za-z]+)'\\)`, 'g'))].map((m) => m[1]);
    expect(words('adjective')).toEqual([...KID_ADJECTIVES]);
    expect(words('animal')).toEqual([...KID_ANIMALS]);
  });

  it('RPC arguments sent by the client match the SQL function signatures', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const service = new SupabaseLeaderboard(fakeClient(calls));
    const submission: ScoreSubmission = { clientId: 'abcdefgh-1', kind: 'challenge', board: 'challenge:blitz:standard', score: 10, timeMs: 2000, correct: 1, answered: 1, seed: 's', log: [{ t: 2000, c: true, h: 0 }], finishedAt: 0 };
    await service.saveProfile({ displayName: 'Ada', kidMode: false, isPublic: true });
    await service.submit(submission);
    await service.getBoard('b', 'all');
    await service.getMyRank('b', 'week');
    await service.getProfile();
    await service.deleteMyData();
    expect(calls.map((c) => c.fn)).toEqual(['upsert_profile', 'submit_score', 'get_leaderboard', 'get_my_rank', 'get_my_profile', 'delete_my_data']);
    for (const call of calls) {
      const params = sqlParams(call.fn);
      expect(Object.keys(call.args).sort(), call.fn).toEqual([...params].sort());
    }
  });

  it('cloud-save RPC arguments match the SQL function signatures', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const client = fakeClient(calls) as unknown as SupabaseAccountClient;
    client.rpc = (fn, args = {}) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: fn === 'put_cloud_save' ? { status: 'ok', revision: 1 } : fn === 'delete_cloud_save' ? { status: 'ok' } : null, error: null });
    };
    const api = supabaseCloudApi(client);
    await api.getSave();
    await api.putSave(defaultProgress(), 0, 'web-1');
    await api.deleteSave();
    expect(calls.map((c) => c.fn)).toEqual(['get_cloud_save', 'put_cloud_save', 'delete_cloud_save']);
    for (const call of calls) expect(Object.keys(call.args).sort(), call.fn).toEqual([...sqlParams(call.fn)].sort());
  });
});
