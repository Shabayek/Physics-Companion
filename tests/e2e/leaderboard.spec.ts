import { test, expect } from '@playwright/test';
import { challengePool } from '../../src/game/engine/challenge';
import { rightAnswer } from '../helpers/answers';

test('offline mode: the leaderboard shows your personal runs on this device', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByTestId('leaderboard-mode')).toContainText('Offline mode');
  await expect(page.getByText('No runs on this device yet')).toBeVisible();

  await page.goto('/challenge/sprint');
  await page.getByRole('button', { name: 'Go!' }).click();
  for (const q of challengePool('sprint', 'beginner', 'sprint:standard:run1')) {
    await expect(page.getByRole('heading', { level: 2, name: q.prompt })).toBeVisible();
    if (q.type === 'numeric') {
      await page.getByRole('textbox').fill(rightAnswer(q));
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.press(String((q.options ?? []).indexOf(String(q.answer)) + 1));
    }
  }
  await expect(page.getByText('Run complete!')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Leaderboard' }).click();
  await page.getByRole('combobox', { name: 'Mode' }).selectOption('sprint');
  const row = page.getByRole('table', { name: 'Leaderboard' }).getByRole('row', { name: /You/ });
  await expect(row).toContainText('#1');
});
