import { useEffect, useState, type FormEvent } from 'react';
import { gameNow, useGameStore } from '../../store/useGameStore';
import { useOnlineStore } from '../../services/leaderboard/onlineStore';
import { deleteMyOnlineData, flushQueue, getLeaderboardService, loadProfile, saveProfile } from '../../services/leaderboard';
import { describeNameError, displayNameError, generateNickname } from '../../services/leaderboard/nicknames';
import { describeRejection } from '../../services/leaderboard/rules';
import type { BoardPeriod, LeaderboardEntry } from '../../services/leaderboard/types';
import { CHALLENGE_MODES, CHALLENGE_TIMINGS, type ChallengeMode, type ChallengeTiming } from '../../game/engine/challenge';
import { dailyTier } from '../../game/engine/daily';
import { DIFFICULTY_ORDER } from '../../game/engine/progress';
import { BOSSES } from '../../data/bosses';
import { createRng } from '../../lib/rng';
import { formatDuration, toLocalDateKey } from '../../lib/time';
import type { Difficulty } from '../../types';

type Tab = 'challenge' | 'daily' | 'boss';

const MODE_LABEL: Record<ChallengeMode, string> = { blitz: 'Blitz', sprint: 'Sprint', survival: 'Survival' };
const TIMING_LABEL: Record<ChallengeTiming, string> = { standard: 'Standard', relaxed: 'Relaxed', untimed: 'Untimed' };

export default function LeaderboardPage() {
  const online = useOnlineStore();
  const progress = useGameStore((s) => s.progress);
  const [tab, setTab] = useState<Tab>('challenge');
  const [mode, setMode] = useState<ChallengeMode>('blitz');
  const [timing, setTiming] = useState<ChallengeTiming>(progress.settings.challengeTiming);
  const [tier, setTier] = useState<Difficulty>(dailyTier(progress));
  const [bossId, setBossId] = useState(BOSSES[0]?.id ?? 'boss-beginner');
  const [period, setPeriod] = useState<BoardPeriod>('all');

  useEffect(() => {
    if (online.profileStatus === 'unknown') void loadProfile();
  }, [online.profileStatus]);

  const today = toLocalDateKey(gameNow());
  const board = tab === 'challenge' ? `challenge:${mode}:${timing}` : tab === 'daily' ? `daily:${today}:${tier}` : `boss:${bossId}`;
  const effectivePeriod: BoardPeriod = tab === 'daily' ? 'all' : period;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      {online.mode === 'local' ? (
        <p className="glass p-4 text-sm" data-testid="leaderboard-mode">
          📴 Offline mode — showing your best runs on this device. Online leaderboards are available when the game is connected to
          its server.
        </p>
      ) : (
        <ProfilePanel />
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboards">
        {(['challenge', 'daily', 'boss'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'btn primary' : 'btn'} onClick={() => setTab(t)}>
            {t === 'challenge' ? 'Challenge' : t === 'daily' ? 'Daily' : 'Bosses'}
          </button>
        ))}
      </div>

      <div className="glass p-4 space-y-3" role="tabpanel">
        <div className="flex flex-wrap gap-3 items-center">
          {tab === 'challenge' && (
            <>
              <Select label="Mode" value={mode} onChange={(v) => setMode(v as ChallengeMode)} options={CHALLENGE_MODES.map((m) => [m, MODE_LABEL[m]])} />
              <Select label="Timing" value={timing} onChange={(v) => setTiming(v as ChallengeTiming)} options={CHALLENGE_TIMINGS.map((t) => [t, TIMING_LABEL[t]])} />
            </>
          )}
          {tab === 'daily' && (
            <>
              <Select label="Tier" value={tier} onChange={(v) => setTier(v as Difficulty)} options={DIFFICULTY_ORDER.map((d) => [d, d[0]?.toUpperCase() + d.slice(1)])} />
              <span className="text-sm opacity-80">Today ({today}) — everyone at a tier gets the same questions.</span>
            </>
          )}
          {tab === 'boss' && (
            <Select label="Boss" value={bossId} onChange={setBossId} options={BOSSES.map((b) => [b.id, `${b.emoji} ${b.name}`])} />
          )}
          {tab !== 'daily' && (
            <div className="flex gap-1" role="group" aria-label="Period">
              {(['all', 'week'] as const).map((p) => (
                <button key={p} className={period === p ? 'btn primary text-sm' : 'btn text-sm'} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                  {p === 'all' ? 'All time' : 'This week'}
                </button>
              ))}
            </div>
          )}
        </div>
        <BoardTable key={`${board}:${effectivePeriod}:${online.mode}`} board={board} period={effectivePeriod} isBoss={tab === 'boss'} />
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="text-sm">
      {label}{' '}
      <select className="ml-1 p-1 rounded bg-black/30" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function BoardTable({ board, period, isBoss }: { board: string; period: BoardPeriod; isBoss: boolean }) {
  const mode = useOnlineStore((s) => s.mode);
  const last = useOnlineStore((s) => s.last);
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; rows: LeaderboardEntry[]; me: LeaderboardEntry | null; error?: string }>({
    status: 'loading',
    rows: [],
    me: null,
  });
  const refreshKey = last ? `${last.kind}:${last.board}:${last.rank ?? ''}` : '';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const service = await getLeaderboardService();
        const [rows, me] = await Promise.all([service.getBoard(board, period, 20), service.getMyRank(board, period)]);
        if (!cancelled) setState({ status: 'ready', rows, me });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', rows: [], me: null, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [board, period, refreshKey]);

  if (state.status === 'loading') return <p className="text-sm opacity-80" role="status">Loading…</p>;
  if (state.status === 'error') return <p className="text-sm" role="alert">Could not load the leaderboard. Check your connection and try again.</p>;
  if (state.rows.length === 0) {
    return <p className="text-sm opacity-80">{mode === 'local' ? 'No runs on this device yet — play to set a score!' : 'No scores yet. Be the first!'}</p>;
  }
  const meListed = state.rows.some((r) => r.isMe);
  return (
    <table className="leaderboard" aria-label="Leaderboard">
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">{mode === 'local' ? 'Run' : 'Player'}</th>
          <th scope="col">{isBoss ? 'Time' : 'Score'}</th>
          {isBoss && <th scope="col">Hearts</th>}
          <th scope="col">Date</th>
        </tr>
      </thead>
      <tbody>
        {state.rows.map((r, i) => (
          <Row key={`${r.rank}:${r.displayName}:${i}`} entry={r} isBoss={isBoss} highlight={r.isMe && mode === 'online'} />
        ))}
        {!meListed && state.me && (
          <>
            <tr aria-hidden="true">
              <td colSpan={isBoss ? 5 : 4} className="text-center opacity-60">⋯</td>
            </tr>
            <Row entry={state.me} isBoss={isBoss} highlight />
          </>
        )}
      </tbody>
    </table>
  );
}

function Row({ entry, isBoss, highlight }: { entry: LeaderboardEntry; isBoss: boolean; highlight: boolean }) {
  return (
    <tr className={highlight ? 'me' : ''} aria-current={highlight ? 'true' : undefined}>
      <td>#{entry.rank}</td>
      <td>{entry.displayName}{highlight && ' (you)'}</td>
      <td>{isBoss ? formatDuration(entry.timeMs) : entry.score}</td>
      {isBoss && <td aria-label={`${entry.score} hearts`}>{'❤️'.repeat(entry.score)}</td>}
      <td>{new Date(entry.createdAt).toLocaleDateString()}</td>
    </tr>
  );
}

function ProfilePanel() {
  const { profile, profileStatus, pending, last, error, offline } = useOnlineStore();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const notify = useGameStore((s) => s.notify);

  if (profileStatus === 'loading' || profileStatus === 'unknown') return <p className="glass p-4 text-sm" role="status">Connecting…</p>;
  if (profileStatus === 'error') {
    return (
      <div className="glass p-4 text-sm space-y-2" role="alert">
        <p>Could not reach the leaderboard server{error ? ` (${error})` : ''}. Your scores are saved on this device and will be uploaded later.</p>
        <button className="btn" onClick={() => void loadProfile()}>Try again</button>
      </div>
    );
  }
  if (!profile || editing) return <JoinForm onDone={() => setEditing(false)} editing={!!profile} />;

  return (
    <section className="glass p-4 space-y-2" aria-label="Your leaderboard profile">
      <p>
        Playing as <span className="font-semibold">{profile.displayName}</span> · {profile.isPublic ? 'visible on public boards' : 'private (only you see your rank)'}
      </p>
      {offline && <p className="text-sm">📴 Can’t reach the leaderboard server right now — your scores are kept and will upload later.</p>}
      {pending > 0 && (
        <p className="text-sm">
          ⏳ {pending} score{pending === 1 ? '' : 's'} waiting to upload.{' '}
          <button className="btn text-sm" onClick={() => void flushQueue(true)}>Retry now</button>
        </p>
      )}
      {last?.kind === 'accepted' && last.rank !== undefined && <p className="text-sm">✓ Last score submitted — rank #{last.rank}.</p>}
      {last?.kind === 'rejected' && <p className="text-sm">⚠️ {describeRejection(last.code)}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn text-sm" onClick={() => setEditing(true)}>Edit profile</button>
        {confirmDelete ? (
          <>
            <span className="text-sm self-center">Delete your name and all your online scores?</span>
            <button
              className="btn text-sm"
              onClick={() => {
                void deleteMyOnlineData().then(
                  () => notify({ kind: 'info', title: 'Online data deleted', message: 'Your scores and name were removed from the server.' }),
                  () => notify({ kind: 'error', title: 'Could not delete online data', message: 'Please try again when you are online.' }),
                );
                setConfirmDelete(false);
              }}
            >
              Yes, delete
            </button>
            <button className="btn text-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <button className="btn ghost text-sm" onClick={() => setConfirmDelete(true)}>Delete my online data</button>
        )}
      </div>
    </section>
  );
}

function JoinForm({ onDone, editing }: { onDone: () => void; editing: boolean }) {
  const kidMode = useGameStore((s) => s.progress.ageMode === 'kid');
  const profile = useOnlineStore((s) => s.profile);
  const [seed, setSeed] = useState(1);
  const [name, setName] = useState(() => profile?.displayName ?? (kidMode ? generateNickname(createRng(`nick:${gameNow()}`)) : ''));
  const [isPublic, setIsPublic] = useState(profile?.isPublic ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reroll = () => {
    setSeed((s) => s + 1);
    setName(generateNickname(createRng(`nick:${gameNow()}:${seed}`)));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local = displayNameError(name, kidMode);
    if (local) {
      setError(describeNameError(local));
      return;
    }
    setBusy(true);
    try {
      const result = await saveProfile({ displayName: name.trim(), kidMode, isPublic });
      if (result.ok) {
        setError(null);
        onDone();
      } else if (result.code === 'name_taken' && kidMode) {
        reroll();
        setError('That nickname was taken — here is a new one.');
      } else {
        setError(describeNameError(result.code));
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="glass p-4 space-y-3" onSubmit={(e) => void submit(e)} aria-label={editing ? 'Edit profile' : 'Join the leaderboard'}>
      <h2 className="font-semibold">{editing ? 'Edit your profile' : 'Join the leaderboard'}</h2>
      {!editing && <p className="text-sm opacity-80">Pick a name to appear on the online boards. No email or personal details needed.</p>}
      {kidMode ? (
        <div className="flex items-center gap-2">
          <span className="font-semibold" data-testid="nickname">{name}</span>
          <button type="button" className="btn text-sm" onClick={reroll}>🎲 Another nickname</button>
        </div>
      ) : (
        <label className="block text-sm">
          Display name
          <input className="answer-input block mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="nickname" />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        Show me on public leaderboards
      </label>
      {error && <p className="text-sm" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn primary" disabled={busy}>{editing ? 'Save' : 'Join'}</button>
        {editing && <button type="button" className="btn" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}
