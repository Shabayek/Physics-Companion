// Seeds the app's localStorage save before the page loads (E2E).
import type { Page } from '@playwright/test';
import type { Progress } from '../../src/types';

export async function seedProgress(page: Page, progress: Progress): Promise<void> {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.setItem('physics-companion-progress', value);
      sessionStorage.setItem('__seeded', '1');
    }
  }, JSON.stringify({ version: 2, state: { progress } }));
}
