import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { defaultProgress, recordMission } from '../../src/game/engine/progress';
import { missionsByWorld } from '../../src/data/missions';
import { seedProgress } from '../helpers/storage';
import type { Progress } from '../../src/types';

const PAGES = ['/', '/world/beginner', '/mission/b-speed', '/boss/beginner', '/daily', '/challenge', '/challenge/sprint', '/leaderboard', '/lab', '/codex', '/achievements', '/collection', '/profile', '/settings'];
const THEMES: Progress['theme'][] = ['dark', 'light', 'high-contrast'];

function progressWith(theme: Progress['theme']): Progress {
  let p = defaultProgress();
  for (const m of missionsByWorld('beginner').slice(0, 6)) p = recordMission(p, m.id, 2, 10, 1);
  return { ...p, theme };
}

// One test per page and theme: each stays short (its own time budget) and they run in parallel.
for (const theme of THEMES) {
  for (const path of PAGES) {
    test(`axe: no WCAG A/AA violations — ${theme} theme — ${path}`, async ({ page }) => {
      await seedProgress(page, progressWith(theme));
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const report = results.violations.map((v) => `[${v.impact}] ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(report, report.join('\n')).toEqual([]);
    });
  }
}

async function axe(page: import('@playwright/test').Page, label: string, report: string[]) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of results.violations) report.push(`${label} [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const theme of ['dark', 'light'] as const) {
  test(`axe: interactive states (quiz feedback, results, boss HUD, challenge run) — ${theme}`, async ({ page }) => {
    test.setTimeout(90_000);
    await seedProgress(page, progressWith(theme));
    const report: string[] = [];
    // Mission quiz: question with hints, then feedback, then the result screen.
    await page.goto('/mission/b-speed');
    await page.getByRole('button', { name: 'Practice →' }).click();
    await page.getByRole('button', { name: 'Take Quiz →' }).click();
    await page.getByRole('button', { name: /Hint/ }).click();
    await axe(page, 'quiz question + hint', report);
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await axe(page, 'quiz feedback', report);
    for (let i = 0; i < 10 && (await page.getByRole('button', { name: /Next question|See results/ }).count()); i++) {
      const next = page.getByRole('button', { name: /Next question|See results/ });
      const done = (await next.textContent())?.includes('See results');
      await next.click();
      if (done) break;
      if (await page.getByRole('textbox').count()) await page.getByRole('textbox').fill('1');
      else await page.getByRole('radio').first().check();
      await page.getByRole('button', { name: 'Check answer' }).click();
    }
    await page.getByTestId('mission-result').waitFor();
    await axe(page, 'mission result + toasts', report);
    // Boss battle HUD after one answer.
    await page.goto('/boss/beginner');
    await page.getByRole('button', { name: 'Begin battle' }).click();
    if (await page.getByRole('textbox').count()) await page.getByRole('textbox').fill('1');
    else await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await axe(page, 'boss battle', report);
    // Challenge run in progress.
    await page.goto('/challenge/survival');
    await page.getByRole('button', { name: 'Go!' }).click();
    await page.getByTestId('challenge-hud').waitFor();
    await axe(page, 'challenge run', report);
    expect(report, report.join('\n')).toEqual([]);
  });
}
