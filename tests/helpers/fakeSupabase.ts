// In-memory stand-in for a Supabase project, served to the browser with Playwright's page.route().
// It speaks the same HTTP API supabase-js uses (anonymous sign-up + PostgREST RPC) and implements
// the RPCs' semantics minimally; input validation itself is covered by the SQL tests.
import type { Page, Route } from '@playwright/test';

export const FAKE_SUPABASE_URL = 'http://localhost:54321';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': '*',
};

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** A structurally valid (unsigned) JWT — supabase-js only decodes it. */
function fakeJwt(sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub, role: 'authenticated', aud: 'authenticated', is_anonymous: true, iat: now, exp: now + 3600 })}.sig`;
}

interface Profile {
  display_name: string;
  kid_mode: boolean;
  is_public: boolean;
}

interface Score {
  user: string;
  board: string;
  kind: string;
  score: number;
  time_ms: number;
  client_id: string;
  created_at: string;
}

export class FakeSupabase {
  signUps = 0;
  profiles = new Map<string, Profile>();
  scores: Score[] = [];
  calls: { fn: string; args: Record<string, unknown>; user: string | null }[] = [];
  /** Cloud saves per user (same semantics as put_cloud_save). */
  saves = new Map<string, { progress: unknown; revision: number; device: string }>();
  /** Account emails: confirmed and pending (linking). */
  emails = new Map<string, { email: string | null; pending: string | null }>();
  otpRequests: string[] = [];
  /** Simulate a network outage for RPC calls. */
  offline = false;

  async install(page: Page): Promise<void> {
    await page.route(`${FAKE_SUPABASE_URL}/**`, (route) => this.handle(route));
  }

  private userFrom(route: Route): string | null {
    const auth = route.request().headers()['authorization'] ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    const payload = token.split('.')[1];
    if (!payload) return null;
    try {
      return (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: string }).sub ?? null;
    } catch {
      return null;
    }
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  private async handle(route: Route): Promise<void> {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;

    if (path === '/auth/v1/signup') {
      const id = `00000000-0000-4000-8000-${String(++this.signUps).padStart(12, '0')}`;
      return this.json(route, {
        access_token: fakeJwt(id),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: `refresh-${id}`,
        user: { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
      });
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
    if (path === '/auth/v1/user') {
      const user = this.userFrom(route);
      if (!user) return this.json(route, { message: 'not signed in' }, 401);
      if (req.method() === 'PUT') {
        const body = (req.postDataJSON() ?? {}) as { email?: string };
        this.emails.set(user, { email: this.emails.get(user)?.email ?? null, pending: body.email ?? null });
      }
      const e = this.emails.get(user);
      return this.json(route, {
        id: user, aud: 'authenticated', role: 'authenticated', email: e?.email ?? '', new_email: e?.pending ?? undefined,
        is_anonymous: !e?.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
      });
    }
    if (path === '/auth/v1/otp') {
      this.otpRequests.push(String(((req.postDataJSON() ?? {}) as { email?: string }).email));
      return this.json(route, {});
    }

    const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(path);
    if (!rpc) return this.json(route, { message: `unexpected ${req.method()} ${path}` }, 404);
    if (this.offline) return route.abort('internetdisconnected');
    const fn = rpc[1] as string;
    const args = (req.postDataJSON() ?? {}) as Record<string, unknown>;
    const user = this.userFrom(route);
    this.calls.push({ fn, args, user });
    return this.json(route, this.rpc(fn, args, user));
  }

  private rpc(fn: string, a: Record<string, unknown>, user: string | null): unknown {
    switch (fn) {
      case 'get_my_profile':
        return (user && this.profiles.get(user)) ?? null;
      case 'upsert_profile': {
        if (!user) return { status: 'error', code: 'not_authenticated' };
        const name = String(a.p_display_name).trim();
        const taken = [...this.profiles.entries()].some(([id, p]) => id !== user && p.display_name.toLowerCase() === name.toLowerCase());
        if (taken) return { status: 'error', code: 'name_taken' };
        this.profiles.set(user, { display_name: name, kid_mode: !!a.p_kid_mode, is_public: !!a.p_is_public });
        return { status: 'ok' };
      }
      case 'submit_score': {
        if (!user) return { status: 'rejected', code: 'not_authenticated' };
        if (!this.profiles.has(user)) return { status: 'rejected', code: 'no_profile' };
        if (this.scores.some((s) => s.user === user && s.client_id === a.p_client_id)) return { status: 'duplicate' };
        this.scores.push({ user, board: String(a.p_board), kind: String(a.p_kind), score: Number(a.p_score), time_ms: Number(a.p_time_ms), client_id: String(a.p_client_id), created_at: new Date().toISOString() });
        return { status: 'accepted', rank: this.rank(String(a.p_board), user) };
      }
      case 'get_leaderboard':
        return this.board(String(a.p_board), user).filter((r) => this.profiles.get(r.user)?.is_public).slice(0, Number(a.p_limit ?? 20)).map((r) => this.row(r, user));
      case 'get_my_rank': {
        const mine = this.board(String(a.p_board), user).find((r) => r.user === user);
        return mine && user ? [{ ...this.row(mine, user), rank: this.rank(String(a.p_board), user) }] : [];
      }
      case 'delete_my_data':
        if (user) {
          this.profiles.delete(user);
          this.scores = this.scores.filter((s) => s.user !== user);
          this.saves.delete(user);
        }
        return { status: 'ok' };
      case 'get_cloud_save': {
        const save = user ? this.saves.get(user) : undefined;
        return save ? { progress: save.progress, revision: save.revision, device: save.device, updated_at: new Date().toISOString() } : null;
      }
      case 'put_cloud_save': {
        if (!user) return { status: 'error', code: 'not_authenticated' };
        const current = this.saves.get(user);
        const expected = Number(a.p_expected_revision ?? 0);
        if ((current?.revision ?? 0) !== expected) return { status: 'conflict', revision: current?.revision ?? 0, progress: current?.progress ?? null };
        const revision = expected + 1;
        this.saves.set(user, { progress: a.p_progress, revision, device: String(a.p_device) });
        return { status: 'ok', revision };
      }
      case 'delete_cloud_save':
        if (user) this.saves.delete(user);
        return { status: 'ok' };
      default:
        return { message: `unknown rpc ${fn}` };
    }
  }

  /** Best score per player, ranked like the SQL (boss: fastest; others: highest score). */
  private board(board: string, _user: string | null): Score[] {
    const boss = board.startsWith('boss:');
    const order = (x: Score, y: Score) => (boss ? x.time_ms - y.time_ms || y.score - x.score : y.score - x.score || x.time_ms - y.time_ms);
    const best = new Map<string, Score>();
    for (const s of this.scores.filter((x) => x.board === board)) {
      const prev = best.get(s.user);
      if (!prev || order(s, prev) < 0) best.set(s.user, s);
    }
    return [...best.values()].sort(order);
  }

  private rank(board: string, user: string): number {
    return this.board(board, user).findIndex((r) => r.user === user) + 1;
  }

  private row(s: Score, user: string | null) {
    const list = this.board(s.board, user).filter((r) => this.profiles.get(r.user)?.is_public);
    return { rank: list.indexOf(s) + 1, display_name: this.profiles.get(s.user)?.display_name ?? '?', score: s.score, time_ms: s.time_ms, created_at: s.created_at, is_me: s.user === user };
  }

  /** Seed another player directly. */
  addPlayer(id: string, name: string, board: string, score: number, timeMs = 30000): void {
    this.profiles.set(id, { display_name: name, kid_mode: false, is_public: true });
    this.scores.push({ user: id, board, kind: board.split(':')[0] ?? 'challenge', score, time_ms: timeMs, client_id: `seed-${id}`, created_at: new Date().toISOString() });
  }
}
