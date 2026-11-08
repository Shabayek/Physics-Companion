import { test, expect } from '@playwright/test';
import { challengePool } from '../../src/game/engine/challenge';
import { rightAnswer } from '../helpers/answers';

test('perfect Sprint, keyboard only: results, personal best and achievement', async ({ page }) => {
  await page.goto('/challenge');
  await page.getByRole('link', { name: 'Start Sprint' }).click();
  await page.getByRole('button', { name: 'Go!' }).click();
  const pool = challengePool('sprint', 'beginner', 'sprint:standard:run1');
  for (const [i, q] of pool.entries()) {
    await expect(page.getByText(`Question ${i + 1} of 10`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: q.prompt })).toBeVisible();
    if (q.type === 'numeric') {
      await page.getByRole('textbox').fill(rightAnswer(q));
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.press(String((q.options ?? []).indexOf(String(q.answer)) + 1));
    }
  }
  const result = page.getByTestId('challenge-result');
  await expect(result.getByText('Run complete!')).toBeVisible();
  await expect(result.getByText(/Correct: 10\/10 \(100%\)/)).toBeVisible();
  await expect(result.getByText('🏅 New personal best!')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Achievements' }).click();
  await expect(page.getByRole('article', { name: 'Perfect Sprint' }).getByText(/✓ Unlocked/)).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Challenge' }).click();
  await expect(page.getByTestId('best-sprint')).toHaveText(/Best: \d+ pts \(10\/10\)/);
});

test('Blitz: the clock runs out', async ({ page }) => {
  await page.clock.install();
  await page.goto('/challenge/blitz');
  await page.getByRole('button', { name: 'Go!' }).click();
  await expect(page.getByRole('timer')).toHaveText('60 s');
  await page.clock.runFor(30_000);
  await expect(page.getByRole('timer')).toHaveText('30 s');
  await page.clock.runFor(31_000);
  await expect(page.getByText('Time’s up!')).toBeVisible();
});

test('relaxed timing is remembered and changes the limits', async ({ page }) => {
  await page.goto('/challenge');
  await page.getByRole('radio', { name: 'Relaxed (×1.5 time)' }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Relaxed (×1.5 time)' })).toBeChecked();
  await expect(page.getByRole('region', { name: /Sprint/ }).getByText(/30 s each/)).toBeVisible();
});
