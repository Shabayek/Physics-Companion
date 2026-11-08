import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { defaultProgress } from '../../../src/game/engine/progress';
import { FakeSupabase } from '../../helpers/fakeSupabase';
import { seedProgress } from '../../helpers/storage';

test('axe: online screens (leaderboard join in Kid mode, cloud panel with parental gate)', async ({ page }) => {
  const supa = new FakeSupabase();
  supa.addPlayer('00000000-0000-4000-8000-00000000aaaa', 'Bob', 'challenge:blitz:standard', 150);
  await supa.install(page);
  await seedProgress(page, { ...defaultProgress(), ageMode: 'kid', theme: 'light' });
  const report: string[] = [];
  const check = async (label: string) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of r.violations) report.push(`${label} [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  };
  await page.goto('/leaderboard');
  await page.getByRole('form', { name: 'Join the leaderboard' }).waitFor();
  await check('leaderboard join (kid)');
  await page.goto('/profile');
  await page.getByRole('checkbox', { name: 'Back up my progress to the cloud' }).check();
  await page.getByRole('form', { name: 'Grown-up check: link an email' }).waitFor();
  await check('cloud panel (kid)');
  expect(report, report.join('\n')).toEqual([]);
});
