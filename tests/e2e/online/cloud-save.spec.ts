import { test, expect, type Page } from '@playwright/test';
import { defaultProgress, recordMission } from '../../../src/game/engine/progress';
import type { Progress } from '../../../src/types';
import { FakeSupabase } from '../../helpers/fakeSupabase';
import { seedProgress } from '../../helpers/storage';

const AUTH_KEY = 'physics-companion-auth';

async function enableCloud(page: Page) {
  await page.goto('/profile');
  const panel = page.getByRole('region', { name: 'Cloud save' });
  await panel.getByRole('checkbox', { name: 'Back up my progress to the cloud' }).check();
  await expect(panel.getByTestId('cloud-status')).toHaveText(/Synced/);
  return panel;
}

test('two devices, one account: progress from both is merged and Quanta add up', async ({ browser, baseURL }) => {
  const supa = new FakeSupabase();
  const deviceA = await (await browser.newContext({ baseURL: baseURL ?? '' })).newPage();
  const deviceB = await (await browser.newContext({ baseURL: baseURL ?? '' })).newPage();
  await supa.install(deviceA);
  await supa.install(deviceB);

  // Device A: Speed Racer done, 30 Quanta. Turn on cloud save → first upload.
  const a0: Progress = { ...recordMission(defaultProgress('Ada'), 'b-speed', 3, 40, 1), currency: 30 };
  await seedProgress(deviceA, a0);
  await enableCloud(deviceA);
  expect(supa.saves.size).toBe(1);
  const [userId] = [...supa.saves.keys()];

  // Device B: different progress. Signing in there (normally via the emailed magic link) gives it
  // the same account; we copy A's session to simulate the completed link.
  const session = await deviceA.evaluate((k) => localStorage.getItem(k), AUTH_KEY);
  await deviceB.addInitScript(([k, v]) => { if (v && !localStorage.getItem(k)) localStorage.setItem(k, v); }, [AUTH_KEY, session] as const);
  const b0: Progress = { ...recordMission(defaultProgress('Ada'), 'b-gravity', 2, 30, 1), currency: 20 };
  await seedProgress(deviceB, b0);
  await enableCloud(deviceB);
  await expect(deviceB.getByLabel('Notifications').getByText('Progress synced')).toBeVisible();
  // B now has both missions and 30 + 20 Quanta (plus any achievements awarded for the combined progress).
  const bProgress = await deviceB.evaluate(() => JSON.parse(localStorage.getItem('physics-companion-progress') ?? '{}').state.progress as Progress);
  expect(bProgress.missions['b-speed']?.completed).toBe(true);
  expect(bProgress.missions['b-gravity']?.completed).toBe(true);
  expect(bProgress.currency).toBeGreaterThanOrEqual(50);
  expect(supa.saves.get(userId as string)?.revision).toBe(2);

  // Back on A: syncing brings in B's progress.
  await deviceA.getByRole('region', { name: 'Cloud save' }).getByRole('button', { name: 'Sync now' }).click();
  await expect.poll(async () => deviceA.evaluate(() => JSON.parse(localStorage.getItem('physics-companion-progress') ?? '{}').state.progress.missions['b-gravity']?.completed)).toBe(true);
  const aProgress = await deviceA.evaluate(() => JSON.parse(localStorage.getItem('physics-companion-progress') ?? '{}').state.progress as Progress);
  expect(aProgress.currency).toBe(bProgress.currency);
});

test('link an email to use the progress elsewhere; sign-in link on another device', async ({ page }) => {
  const supa = new FakeSupabase();
  await supa.install(page);
  const panel = await enableCloud(page);
  const link = panel.getByRole('form', { name: 'Link an email' });
  await link.getByRole('textbox', { name: 'Email to link' }).fill('ada@example.com');
  await link.getByRole('button', { name: 'Send link' }).click();
  // The form is replaced by the pending-confirmation message.
  await expect(panel.getByText(/Check a•••@example.com and click the confirmation link/)).toBeVisible();
  expect([...supa.emails.values()]).toEqual([{ email: null, pending: 'ada@example.com' }]);

  await panel.getByText('Already linked an email on another device?').click();
  const signIn = panel.getByRole('form', { name: 'Sign in with email' });
  await signIn.getByRole('textbox', { name: 'Email to sign in' }).fill('ada@example.com');
  await signIn.getByRole('button', { name: 'Send sign-in link' }).click();
  await expect(signIn.getByRole('status')).toContainText('We sent a link');
  expect(supa.otpRequests).toEqual(['ada@example.com']);
});
