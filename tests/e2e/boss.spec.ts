import { test, expect, type Page } from '@playwright/test';
import { getBoss } from '../../src/data/bosses';
import { missionsByWorld } from '../../src/data/missions';
import { defaultProgress, recordMission } from '../../src/game/engine/progress';
import { applyBossAnswer, bossStagePools, nextBossQuestion, startBossBattle } from '../../src/game/engine/boss';
import type { Boss, QuizQuestion } from '../../src/types';
import { rightAnswer } from '../helpers/answers';
import { seedProgress } from '../helpers/storage';

const golem = getBoss('boss-beginner') as Boss;

function golemReady() {
  let p = defaultProgress();
  for (const m of missionsByWorld('beginner').slice(0, 6)) p = recordMission(p, m.id, 2, 10, 1);
  return p;
}

async function answerCorrectly(page: Page, q: QuizQuestion) {
  const a = rightAnswer(q);
  if (q.type === 'numeric') await page.getByRole('textbox').fill(a);
  else await page.getByRole('radio', { name: a, exact: true }).check();
  await page.getByRole('button', { name: 'Check answer' }).click();
}

test('boss appears on the world page once 6 missions are done', async ({ page }) => {
  await seedProgress(page, golemReady());
  await page.goto('/world/beginner');
  const card = page.getByRole('region', { name: 'Boss: The Inertia Golem' });
  await expect(card.getByText('The world boss has appeared!', { exact: false })).toBeVisible();
  await card.getByRole('link', { name: 'Challenge' }).click();
  await expect(page.getByRole('heading', { name: 'The Inertia Golem' })).toBeVisible();
});

test('flawless victory unlocks the next world and fills the Codex', async ({ page }) => {
  await seedProgress(page, golemReady());
  await page.goto('/boss/beginner');
  await page.getByRole('button', { name: 'Begin battle' }).click();

  const pools = bossStagePools(golem, '1');
  let battle = startBossBattle(golem, '1');
  while (battle.status === 'fighting') {
    const q = nextBossQuestion(battle, pools) as QuizQuestion;
    await expect(page.getByRole('heading', { level: 2, name: q.prompt })).toBeVisible();
    await answerCorrectly(page, q);
    battle = applyBossAnswer(battle, { questionId: q.id, answer: '', correct: true, hintsUsed: 0, freeHints: 0, timeMs: 0 }, pools);
    await expect(page.getByRole('progressbar', { name: 'The Inertia Golem HP' })).toHaveAttribute('aria-valuenow', String(battle.hp));
    await page.getByRole('button', { name: battle.status === 'won' ? 'See outcome' : 'Next question →' }).click();
  }

  await expect(page.getByRole('heading', { name: 'Victory!' })).toBeVisible();
  await expect(page.getByLabel('3 of 3 stars')).toBeVisible();
  await expect(page.getByText('First victory! Quanta earned: 100')).toBeVisible();
  await expect(page.getByLabel('Notifications').getByText('New world unlocked!')).toBeVisible();

  await page.reload();
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByLabel('Worlds unlocked: 2 of 4')).toBeVisible();
  await page.getByRole('link', { name: 'Codex' }).click();
  await expect(page.getByRole('tab', { name: 'Constants (3/19)' })).toBeVisible();
  await page.getByRole('tab', { name: 'Laws (10/30)' }).click();
  const newton = page.getByRole('article', { name: "Newton's First Law" });
  await expect(newton).toBeVisible();
  await expect(newton.getByText('Not yet discovered')).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Ideal gas law' }).getByText('Not yet discovered')).toBeVisible();
});
