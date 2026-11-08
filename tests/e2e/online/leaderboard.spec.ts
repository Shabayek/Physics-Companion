import { test, expect, type Page } from '@playwright/test';
import { challengePool } from '../../../src/game/engine/challenge';
import { rightAnswer } from '../../helpers/answers';
import { FakeSupabase } from '../../helpers/fakeSupabase';

/** Plays a perfect Sprint with 2 s per answer (a human-plausible pace). */
async function playSprint(page: Page, run: number) {
  await page.goto('/challenge/sprint');
  await page.getByRole('button', { name: 'Go!' }).click();
  const pool = challengePool('sprint', 'beginner', `sprint:standard:run${run}`);
  for (const q of pool) {
    await expect(page.getByRole('heading', { level: 2, name: q.prompt })).toBeVisible();
    await page.clock.runFor(2000);
    if (q.type === 'numeric') {
      await page.getByRole('textbox').fill(rightAnswer(q));
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.press(String((q.options ?? []).indexOf(String(q.answer)) + 1));
    }
  }
  await expect(page.getByTestId('challenge-result').getByText('Run complete!')).toBeVisible();
}

test('join, submit a run, see it ranked; offline queue; delete data', async ({ page }) => {
  test.setTimeout(90_000); // two full Sprint runs
  const supa = new FakeSupabase();
  supa.addPlayer('00000000-0000-4000-8000-00000000aaaa', 'Bob', 'challenge:sprint:standard', 150);
  await supa.install(page);
  await page.clock.install();

  // Reading boards needs no account.
  await page.goto('/leaderboard');
  await expect(page.getByRole('table', { name: 'Leaderboard' })).toBeHidden(); // blitz board is empty
  expect(supa.signUps).toBe(0);

  // Join: anonymous sign-in + profile.
  const form = page.getByRole('form', { name: 'Join the leaderboard' });
  await form.getByRole('textbox', { name: 'Display name' }).fill('Bob');
  await form.getByRole('button', { name: 'Join' }).click();
  await expect(form.getByRole('alert')).toHaveText('That name is already taken.');
  await form.getByRole('textbox', { name: 'Display name' }).fill('Ada Lovelace');
  await form.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByRole('region', { name: 'Your leaderboard profile' })).toContainText('Playing as Ada Lovelace');
  expect(supa.signUps).toBe(1);

  // A run is submitted automatically with its answer log.
  await playSprint(page, 1);
  await expect.poll(() => supa.calls.filter((c) => c.fn === 'submit_score').length).toBe(1);
  const submitted = supa.calls.find((c) => c.fn === 'submit_score')?.args ?? {};
  expect(submitted).toMatchObject({ p_kind: 'challenge', p_board: 'challenge:sprint:standard', p_answered: 10, p_correct: 10, p_seed: 'sprint:standard:run1' });
  // Real answering times: 2 s of fake clock per answer plus real time (generous for slow machines,
  // still well inside the 20 s Sprint limit).
  expect((submitted.p_log as { t: number }[]).every((e) => e.t >= 2000 && e.t < 15000)).toBe(true);

  await page.goto('/leaderboard');
  await page.getByRole('combobox', { name: 'Mode' }).selectOption('sprint');
  const table = page.getByRole('table', { name: 'Leaderboard' });
  await expect(table.getByRole('row', { name: /Ada Lovelace \(you\)/ })).toContainText('#1');
  await expect(table.getByRole('row', { name: /Bob/ })).toContainText('#2');

  // Offline: the next run waits in the queue and uploads on retry.
  supa.offline = true;
  await playSprint(page, 2);
  await page.goto('/leaderboard');
  const panel = page.getByRole('region', { name: 'Your leaderboard profile' });
  await expect(panel).toContainText('1 score waiting to upload');
  supa.offline = false;
  await panel.getByRole('button', { name: 'Retry now' }).click();
  await expect(panel).not.toContainText('waiting to upload');
  expect(supa.scores.filter((s) => s.board === 'challenge:sprint:standard')).toHaveLength(3);

  // Privacy: delete everything.
  await panel.getByRole('button', { name: 'Delete my online data' }).click();
  await panel.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.getByRole('form', { name: 'Join the leaderboard' })).toBeVisible();
  expect([...supa.profiles.values()].map((p) => p.display_name)).toEqual(['Bob']);
  expect(supa.scores).toHaveLength(1);
});
