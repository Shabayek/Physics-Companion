import { useState, type FormEvent } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { deleteCloudSave, linkEmail, setCloudEnabled, signInWithEmail, syncNow, useCloudStore } from '../../services/cloud';
import { ParentGate } from '../../components/ParentGate';
import { useNow } from '../../lib/useNow';
import { timeAgo } from '../../lib/time';

function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}•••@${domain}`;
}

export function CloudSavePanel() {
  const cloud = useCloudStore();
  const kidMode = useGameStore((s) => s.progress.ageMode === 'kid');
  const notify = useGameStore((s) => s.notify);
  const now = useNow(30_000);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!cloud.available) {
    return (
      <section className="glass p-4 space-y-1" aria-label="Cloud save">
        <h2 className="font-semibold">☁️ Cloud save</h2>
        <p className="text-sm opacity-80">Cloud save needs online features, which are not configured for this game. Use Export / Import to move progress.</p>
      </section>
    );
  }

  const status =
    cloud.state === 'syncing'
      ? 'Syncing…'
      : cloud.state === 'offline'
        ? 'Offline — your progress will sync when you are back online.'
        : cloud.state === 'error'
          ? 'Could not sync right now — it will retry automatically.'
          : cloud.lastSyncedAt
            ? `✓ Synced ${timeAgo(cloud.lastSyncedAt, now)}`
            : 'Not synced yet';

  return (
    <section className="glass p-4 space-y-3" aria-label="Cloud save">
      <h2 className="font-semibold">☁️ Cloud save</h2>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={cloud.enabled} onChange={(e) => void setCloudEnabled(e.target.checked)} />
        Back up my progress to the cloud
      </label>
      {cloud.enabled && (
        <>
          <p className="text-sm" role="status" data-testid="cloud-status">{status}</p>
          <button className="btn text-sm" onClick={() => void syncNow()} disabled={cloud.state === 'syncing'}>Sync now</button>
          <AccountSection kidMode={kidMode} />
          <div>
            {confirmDelete ? (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm">Delete your cloud save? Progress on this device is kept.</span>
                <button
                  className="btn text-sm"
                  onClick={() => {
                    setConfirmDelete(false);
                    void deleteCloudSave().then(
                      () => notify({ kind: 'info', title: 'Cloud save deleted' }),
                      () => notify({ kind: 'error', title: 'Could not delete the cloud save', message: 'Please try again when you are online.' }),
                    );
                  }}
                >
                  Yes, delete
                </button>
                <button className="btn text-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn ghost text-sm" onClick={() => setConfirmDelete(true)}>Delete cloud save</button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function AccountSection({ kidMode }: { kidMode: boolean }) {
  const account = useCloudStore((s) => s.account);
  if (account?.email) {
    return (
      <p className="text-sm">
        🔗 Linked to <span className="font-semibold">{maskEmail(account.email)}</span> — sign in with this email on your other devices to use the same progress.
      </p>
    );
  }
  const link = <EmailForm kind="link" />;
  return (
    <div className="space-y-3">
      {account?.pendingEmail ? (
        <p className="text-sm">📧 Check {maskEmail(account.pendingEmail)} and click the confirmation link to finish linking.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-sm">Want the same progress on another device? Link an email address (no password needed).</p>
          {kidMode ? <ParentGate label="link an email">{link}</ParentGate> : link}
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer">Already linked an email on another device?</summary>
        <div className="mt-2 space-y-1">
          <p className="opacity-80">Sign in with that email here. Progress from this device will be added to your account.</p>
          {kidMode ? <ParentGate label="sign in">{<EmailForm kind="signin" />}</ParentGate> : <EmailForm kind="signin" />}
        </div>
      </details>
    </div>
  );
}

function EmailForm({ kind }: { kind: 'link' | 'signin' }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMessage({ ok: false, text: 'Please enter a valid email address.' });
      return;
    }
    setBusy(true);
    const error = await (kind === 'link' ? linkEmail(email) : signInWithEmail(email)).catch(() => 'Could not reach the server.');
    setBusy(false);
    setMessage(error ? { ok: false, text: error } : { ok: true, text: `We sent a link to ${email.trim()}. Open it on this device to continue.` });
  };
  const label = kind === 'link' ? 'Email to link' : 'Email to sign in';
  return (
    <form noValidate className="flex flex-wrap gap-2 items-center" onSubmit={(e) => void submit(e)} aria-label={kind === 'link' ? 'Link an email' : 'Sign in with email'}>
      <label className="sr-only" htmlFor={`email-${kind}`}>{label}</label>
      <input id={`email-${kind}`} type="email" className="answer-input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <button type="submit" className="btn text-sm" disabled={busy}>{kind === 'link' ? 'Send link' : 'Send sign-in link'}</button>
      {message && (
        <p className="text-sm w-full" role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </form>
  );
}
