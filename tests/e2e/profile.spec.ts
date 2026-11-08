import { test, expect } from '@playwright/test';

test('importing an invalid save shows an error and keeps progress', async ({ page }) => {
  await page.goto('/profile');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 2, missions: {}, currency: 'lots' })),
  });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Import failed');
  await expect(alert).toContainText('currency');
  await expect(page.getByText('Quanta: 0').first()).toBeVisible();
});

test('importing a valid v1 save upgrades it', async ({ page }) => {
  await page.goto('/profile');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'v1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        playerName: 'Ada',
        unlockedWorlds: ['beginner'],
        missions: {},
        currency: 42,
        streakDays: 3,
      }),
    ),
  });
  await expect(page.getByText('Progress imported')).toBeVisible();
  await expect(page.getByText('Player: Ada')).toBeVisible();
  // A legacy streak without a last-active date cannot be trusted as current; it is kept as the longest.
  await expect(page.getByText('Streak: 0 day(s) · Longest: 3')).toBeVisible();
  // 42 imported + 15 for "Warming Up" (the legacy longest streak of 3 is credited retroactively).
  await expect(page.getByLabel('57 Quanta')).toBeVisible();
});
