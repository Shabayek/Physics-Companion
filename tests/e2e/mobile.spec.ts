import { test, expect } from '@playwright/test';
import { getMission } from '../../src/data/missions';
import { buildMissionQuiz } from '../../src/game/engine/questions';
import type { Mission } from '../../src/types';
import { rightAnswer } from '../helpers/answers';
import { defaultProgress } from '../../src/game/engine/progress';
import { seedProgress } from '../helpers/storage';

const PAGES = ['/', '/world/beginner', '/mission/b-speed', '/boss/beginner', '/daily', '/challenge', '/leaderboard', '/lab', '/codex', '/achievements', '/collection', '/profile', '/settings'];

test('no page scrolls sideways on a phone', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    const [scrollWidth, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scrollWidth, path).toBeLessThanOrEqual(width);
  }
});

// Relative limits (share of the screen), checked at every text size, so the test does not depend on
// one system's font metrics.
for (const textSize of ['sm', 'md', 'lg'] as const) {
  test(`compact header and challenge question above the fold (text size ${textSize})`, async ({ page }) => {
    await seedProgress(page, { ...defaultProgress(), settings: { ...defaultProgress().settings, textSize } });
    await page.goto('/challenge/sprint');
    await page.getByRole('button', { name: 'Go!' }).tap();
    const heading = page.getByRole('heading', { level: 2 });
    await heading.waitFor();
    const viewport = page.viewportSize() ?? { width: 0, height: 0 };
    const header = await page.locator('header').boundingBox();
    expect(header?.height ?? Infinity).toBeLessThanOrEqual(viewport.height * 0.25);
    const box = await heading.boundingBox();
    expect((box?.y ?? Infinity) + 20).toBeLessThan(viewport.height);
  });
}

test('a whole mission can be played by tapping', async ({ page }) => {
  await page.goto('/mission/b-speed');
  await page.getByRole('button', { name: 'Practice →' }).tap();
  await page.getByRole('button', { name: 'Take Quiz →' }).tap();
  const questions = buildMissionQuiz(getMission('b-speed') as Mission, '1');
  for (const [i, q] of questions.entries()) {
    if (q.type === 'numeric') await page.getByRole('textbox').fill(rightAnswer(q));
    else await page.getByRole('radio', { name: rightAnswer(q), exact: true }).tap();
    await page.getByRole('button', { name: 'Check answer' }).tap();
    await page.getByRole('button', { name: i === questions.length - 1 ? 'See results' : 'Next question →' }).tap();
  }
  await expect(page.getByTestId('mission-result').getByLabel('3 of 3 stars')).toBeVisible();
});
