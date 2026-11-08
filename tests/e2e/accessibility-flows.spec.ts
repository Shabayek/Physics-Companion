import { test, expect } from '@playwright/test';
import { getMission } from '../../src/data/missions';
import { buildMissionQuiz } from '../../src/game/engine/questions';
import { defaultProgress } from '../../src/game/engine/progress';
import type { Mission } from '../../src/types';
import { rightAnswer } from '../helpers/answers';
import { seedProgress } from '../helpers/storage';

test('keyboard: the skip link jumps to the main content; navigation moves focus to the new page', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Codex' }).click();
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page).toHaveTitle('Laws & Constants Codex · Physics Companion');
});

test('Kid mode: the first hint is free and does not cost stars', async ({ page }) => {
  await seedProgress(page, { ...defaultProgress(), ageMode: 'kid' });
  await page.goto('/mission/b-speed');
  await page.getByRole('button', { name: 'Practice →' }).click();
  await page.getByRole('button', { name: 'Take Quiz →' }).click();
  const questions = buildMissionQuiz(getMission('b-speed') as Mission, '1');
  for (const [i, q] of questions.entries()) {
    await page.getByRole('button', { name: '💡 Free hint' }).click();
    await expect(page.getByRole('list', { name: 'Hints' })).toBeVisible();
    if (q.type === 'numeric') await page.getByRole('textbox').fill(rightAnswer(q));
    else await page.getByRole('radio', { name: rightAnswer(q), exact: true }).check();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.getByRole('button', { name: i === questions.length - 1 ? 'See results' : 'Next question →' }).click();
  }
  const result = page.getByTestId('mission-result');
  await expect(result.getByText('Hints used: 4')).toBeVisible();
  await expect(result.getByLabel('3 of 3 stars')).toBeVisible();
});

// Font metrics differ between systems (and with the Text size setting), so this checks the real
// requirement — no text or control of the result is hidden — at every text size, instead of comparing
// box positions that only hold for one set of fonts.
for (const textSize of ['sm', 'md', 'lg'] as const) {
  test(`notifications never hide result content (1280×720, text size ${textSize})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await seedProgress(page, { ...defaultProgress(), settings: { ...defaultProgress().settings, textSize } });
    await page.goto('/mission/b-speed');
    await page.getByRole('button', { name: 'Practice →' }).click();
    await page.getByRole('button', { name: 'Take Quiz →' }).click();
    const questions = buildMissionQuiz(getMission('b-speed') as Mission, '1');
    for (const [i, q] of questions.entries()) {
      if (q.type === 'numeric') await page.getByRole('textbox').fill(rightAnswer(q));
      else await page.getByRole('radio', { name: rightAnswer(q), exact: true }).check();
      await page.getByRole('button', { name: 'Check answer' }).click();
      await page.getByRole('button', { name: i === questions.length - 1 ? 'See results' : 'Next question →' }).click();
    }
    await page.getByTestId('mission-result').waitFor();
    await expect(page.getByLabel('Notifications').getByRole('listitem').first()).toBeVisible();
    const covered = await page.evaluate(() => {
      const toasts = [...document.querySelectorAll('[aria-label="Notifications"] li')].map((e) => e.getBoundingClientRect());
      const panel = document.querySelector('[data-testid="mission-result"]');
      const hidden: string[] = [];
      for (const el of panel ? [...panel.querySelectorAll('h2, p, button, a')] : []) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects(), ...(el.matches('button, a') ? [el.getBoundingClientRect()] : [])];
        for (const r of rects) {
          for (const t of toasts) {
            if (r.width > 0 && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top) hidden.push((el.textContent ?? '').trim());
          }
        }
      }
      return [...new Set(hidden)];
    });
    expect(covered).toEqual([]);
  });
}
