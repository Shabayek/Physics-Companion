import { test, expect, type Page } from '@playwright/test';
import { getMission } from '../../src/data/missions';
import { buildMissionQuiz } from '../../src/game/engine/questions';
import type { Mission } from '../../src/types';
import { rightAnswer, wrongAnswer } from '../helpers/answers';

const speedRacer = getMission('b-speed') as Mission;

/** Plays attempt `seed` of Speed Racer through the real UI. */
async function playSpeedRacer(page: Page, opts: { correct: boolean; seed: string; hintsOnFirst?: number }) {
  await page.getByRole('button', { name: 'Practice →' }).click();
  await page.getByRole('button', { name: 'Take Quiz →' }).click();
  const questions = buildMissionQuiz(speedRacer, opts.seed);
  for (const [i, q] of questions.entries()) {
    await expect(page.getByRole('heading', { level: 2, name: q.prompt })).toBeVisible();
    for (let h = 0; h < (i === 0 ? (opts.hintsOnFirst ?? 0) : 0); h++) await page.getByRole('button', { name: /hint/i }).click();
    const answer = opts.correct ? rightAnswer(q) : wrongAnswer(q);
    if (q.type === 'numeric') await page.getByRole('textbox').fill(answer);
    else await page.getByRole('radio', { name: answer, exact: true }).check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByTestId('quiz-feedback')).toContainText(opts.correct ? '✓ Correct!' : '✗ Not quite.');
    await page.getByRole('button', { name: i === questions.length - 1 ? 'See results' : 'Next question →' }).click();
  }
}

test('perfect quiz: 3 stars, reward toast, persisted Quanta, replay with new numbers', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Enter' }).first().click();
  await page.getByRole('link', { name: 'Start' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Speed Racer' })).toBeVisible();

  await playSpeedRacer(page, { correct: true, seed: '1' });
  const result = page.getByTestId('mission-result');
  await expect(result.getByLabel('3 of 3 stars')).toBeVisible();
  await expect(result.getByText('First clear! Quanta earned: 10')).toBeVisible();
  await expect(page.getByLabel('Notifications').getByText('Mission complete: Speed Racer')).toBeVisible();
  // 10 (mission) + 10 (First Steps) + 10 (Flawless Logic)
  await expect(page.getByLabel('30 Quanta')).toBeVisible();

  // Progress survives a reload (localStorage persistence); the next attempt uses seed 2.
  await page.reload();
  await expect(page.getByLabel('30 Quanta')).toBeVisible();
  await playSpeedRacer(page, { correct: true, seed: '2' });
  await expect(page.getByText('Replay reward: 2 Quanta')).toBeVisible();
  await expect(page.getByLabel('32 Quanta')).toBeVisible();
});

test('failed quiz: no reward', async ({ page }) => {
  await page.goto('/mission/b-speed');
  await playSpeedRacer(page, { correct: false, seed: '1' });
  await expect(page.getByLabel('0 of 3 stars')).toBeVisible();
  await expect(page.getByText('Earn at least 1★ to collect rewards.')).toBeVisible();
  await expect(page.getByLabel('0 Quanta')).toBeVisible();
});

test('hints: tiered reveal with cost label', async ({ page }) => {
  await page.goto('/mission/b-speed');
  await page.getByRole('button', { name: 'Practice →' }).click();
  await page.getByRole('button', { name: 'Take Quiz →' }).click();
  await page.getByRole('button', { name: 'Hint (−25%)' }).click();
  await expect(page.getByRole('list', { name: 'Hints' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hint (−25%)' }).click();
  await expect(page.getByRole('list', { name: 'Hints' }).getByRole('listitem')).toHaveCount(2);
});

test('keyboard-only: answer with arrow keys and Enter', async ({ page }) => {
  await page.goto('/mission/b-speed');
  await page.getByRole('button', { name: 'Practice →' }).click();
  await page.getByRole('button', { name: 'Take Quiz →' }).click();
  const first = buildMissionQuiz(speedRacer, '1')[0];
  await page.getByRole('radio').first().focus();
  for (let i = 0; i < 4; i++) {
    if (await page.getByRole('radio', { name: first?.answer as string, exact: true }).isChecked()) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('quiz-feedback')).toContainText('✓ Correct!');
  await expect(page.getByRole('button', { name: 'Next question →' })).toBeFocused();
});
