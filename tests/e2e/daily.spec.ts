import { test, expect, type Page } from '@playwright/test';
import { buildDailyChallenge } from '../../src/game/engine/daily';
import { rightAnswer } from '../helpers/answers';

test.use({ timezoneId: 'Europe/Paris' });

async function playDaily(page: Page, date: string) {
  await page.getByRole('button', { name: /Start challenge|Practice again/ }).click();
  const questions = buildDailyChallenge(date, 'beginner');
  for (const [i, q] of questions.entries()) {
    await expect(page.getByRole('heading', { level: 2, name: q.prompt })).toBeVisible();
    const a = rightAnswer(q);
    if (q.type === 'numeric') await page.getByRole('textbox').fill(a);
    else await page.getByRole('radio', { name: a, exact: true }).check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.getByRole('button', { name: i === questions.length - 1 ? 'See results' : 'Next question →' }).click();
  }
}

test('daily challenge over two days: rewards, countdown, streak at risk, streak extended', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+01:00'));
  await page.goto('/');
  const card = page.getByRole('region', { name: '📅 Daily Challenge' });
  await card.getByRole('link', { name: 'Start today’s challenge' }).click();
  await expect(page.getByText('2026-11-07 · beginner tier')).toBeVisible();

  await playDaily(page, '2026-11-07');
  const result = page.getByTestId('daily-result');
  await expect(result.getByRole('heading', { name: 'Daily challenge complete!' })).toBeVisible();
  await expect(result.getByRole('timer')).toHaveText('14:00:00');
  await expect(page.getByRole('link', { name: 'Streak: 1 day' })).toBeVisible();

  // Next day: the streak is at risk until we play again.
  await page.clock.setFixedTime(new Date('2026-11-08T09:00:00+01:00'));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Streak: 1 day — play today to keep it' })).toBeVisible();
  await expect(page.getByText('🔥 Play today to keep your 1-day streak!')).toBeVisible();
  await page.getByRole('link', { name: 'Start today’s challenge' }).click();
  await playDaily(page, '2026-11-08');
  await expect(page.getByRole('table', { name: 'Rewards' }).getByText('Streak bonus (+20%)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Streak: 2 days' })).toBeVisible();

  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page.getByRole('region', { name: '📅 Daily Challenge' }).getByText(/Completed today: 5\/5 correct/)).toBeVisible();
});
