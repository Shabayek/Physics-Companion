import { test, expect } from '@playwright/test';
import { ALL_MISSIONS } from '../../src/data/missions';
import { ACHIEVEMENTS } from '../../src/data/achievements';
import { defaultProgress, recordMission } from '../../src/game/engine/progress';
import { evaluateAchievements } from '../../src/game/engine/achievements';
import { seedProgress } from '../helpers/storage';

test('old progress earns achievements retroactively on load', async ({ page }) => {
  let p = defaultProgress();
  for (const m of ALL_MISSIONS.slice(0, 10)) p = recordMission(p, m.id, 3, 40, 1);
  await seedProgress(page, p);
  // Expected awards, straight from the engine: First Steps, Explorer, Star Collector, Beginner Master.
  const expected = evaluateAchievements(p, 0);
  const n = expected.unlocked.length;
  expect(expected.unlocked.map((a) => a.id)).toEqual(['first-steps', 'explorer', 'star-collector', 'master-beginner']);

  await page.goto('/');
  await expect(page.getByLabel('Notifications').getByText(`${n} achievements unlocked for your progress so far!`)).toBeVisible();
  await expect(page.getByLabel(`${expected.progress.currency} Quanta`)).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Achievements' }).click();
  await expect(page.getByText(`${n} of ${ACHIEVEMENTS.length} unlocked`)).toBeVisible();
  await expect(page.getByRole('article', { name: 'Explorer' }).getByText(/✓ Unlocked/)).toBeVisible();
  await expect(page.getByRole('article', { name: 'Adventurer' }).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Collection' }).click();
  await expect(page.getByRole('heading', { name: `Achievement badges (${n}/`, exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mission badges (0/31)' })).toBeVisible(); // seeded via records only
});
