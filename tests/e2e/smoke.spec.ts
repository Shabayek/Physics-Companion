import { test, expect } from '@playwright/test';

test('every page is reachable from the main navigation', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const pages: [string, string][] = [
    ['Challenge', 'Challenge Mode'],
    ['Lab', 'Free-Play Lab'],
    ['Codex', 'Laws & Constants Codex'],
    ['Leaderboard', 'Leaderboard'],
    ['Achievements', 'Achievements'],
    ['Collection', 'Collection'],
    ['Profile', 'Profile'],
    ['Settings', 'Settings'],
    ['Home', 'Welcome, Explorer!'],
  ];
  for (const [link, heading] of pages) {
    await nav.getByRole('link', { name: link }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});

test('unknown routes redirect home', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Explorer!' })).toBeVisible();
});
