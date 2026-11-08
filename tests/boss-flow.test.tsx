import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BossPage from '../src/features/boss/BossPage';
import World from '../src/features/world/World';
import { setGameClock, useGameStore } from '../src/store/useGameStore';
import { fixedClock } from '../src/lib/time';
import { getBoss } from '../src/data/bosses';
import { missionsByWorld } from '../src/data/missions';
import { defaultProgress, recordMission } from '../src/game/engine/progress';
import { bossStagePools, nextBossQuestion, startBossBattle, applyBossAnswer } from '../src/game/engine/boss';
import type { Boss, QuizQuestion } from '../src/types';
import { rightAnswer, wrongAnswer } from './helpers/answers';

const golem = getBoss('boss-beginner') as Boss;
const clock = fixedClock(1_800_000_000_000);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/boss/:world" element={<BossPage />} />
        <Route path="/world/:difficulty" element={<World />} />
      </Routes>
    </MemoryRouter>,
  );
}

function unlockGolem() {
  let p = defaultProgress();
  for (const m of missionsByWorld('beginner').slice(0, 6)) p = recordMission(p, m.id, 2, 10, 1);
  useGameStore.getState().setProgress(p);
}

async function answer(user: UserEvent, q: QuizQuestion, correct: boolean) {
  const a = correct ? rightAnswer(q) : wrongAnswer(q);
  if (q.type === 'numeric') await user.type(screen.getByRole('textbox'), a);
  else await user.click(screen.getByRole('radio', { name: a }));
  clock.set(clock.now() + 4000);
  await user.click(screen.getByRole('button', { name: 'Check answer' }));
}

beforeEach(() => {
  useGameStore.getState().reset();
  useGameStore.setState({ toasts: [] });
  setGameClock(clock);
});

describe('boss flow', () => {
  it('world page shows the locked boss with unlock progress', () => {
    renderAt('/world/beginner');
    const card = screen.getByRole('region', { name: 'Boss: The Inertia Golem' });
    expect(within(card).getByText('Complete 6 missions to challenge the boss (0/6).')).toBeInTheDocument();
    expect(within(card).getByText('🔒 Locked')).toBeInTheDocument();
  });

  it('a locked boss page explains how to wake it', () => {
    renderAt('/boss/beginner');
    expect(screen.getByRole('heading', { name: 'The Inertia Golem is sleeping' })).toBeInTheDocument();
  });

  it('full victory: HP drops through the stages, result screen, world unlocked', async () => {
    unlockGolem();
    const user = userEvent.setup();
    renderAt('/boss/beginner');
    await user.click(screen.getByRole('button', { name: 'Begin battle' }));

    // Mirror the battle to know which question comes next (seed = attempt 1).
    const pools = bossStagePools(golem, '1');
    let battle = startBossBattle(golem, '1');
    for (let i = 0; i < 9; i++) {
      const q = nextBossQuestion(battle, pools) as QuizQuestion;
      expect(screen.getByRole('heading', { level: 2, name: q.prompt })).toBeInTheDocument();
      const correct = i !== 1; // one miss
      await answer(user, q, correct);
      battle = applyBossAnswer(battle, { questionId: q.id, answer: '', correct, hintsUsed: 0, freeHints: 0, timeMs: 0 }, pools);
      expect(screen.getByTestId('boss-feedback')).toHaveTextContent(correct ? '💥 You dealt 10 damage!' : '💔 You lost a heart!');
      expect(screen.getByRole('progressbar', { name: 'The Inertia Golem HP' })).toHaveAttribute('aria-valuenow', String(battle.hp));
      if (i === 1) expect(screen.getByRole('img', { name: 'Hearts: 2 of 3' })).toBeInTheDocument();
      if (i === 3) expect(screen.getByText(/Stage 2 of 3/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: battle.status === 'fighting' ? 'Next question →' : 'See outcome' }));
    }
    // 8 hits needed after one miss → 10 answers total
    const q = nextBossQuestion(battle, pools) as QuizQuestion;
    await answer(user, q, true);
    expect(screen.getByTestId('boss-feedback')).toHaveTextContent('The Inertia Golem is defeated!');
    await user.click(screen.getByRole('button', { name: 'See outcome' }));

    const result = screen.getByTestId('boss-result');
    expect(within(result).getByRole('heading', { name: 'Victory!' })).toBeInTheDocument();
    expect(within(result).getByLabelText('2 of 3 stars')).toBeInTheDocument();
    expect(within(result).getByText('First victory! Quanta earned: 100')).toBeInTheDocument();
    expect(within(result).getByText(/New Codex entries/)).toBeInTheDocument();
    expect(within(result).getByText(/Intermediate/i, { selector: 'span' })).toBeInTheDocument();
    expect(useGameStore.getState().progress.unlockedWorlds).toContain('intermediate');
  });

  it('retreat counts as a lost attempt', async () => {
    unlockGolem();
    const user = userEvent.setup();
    renderAt('/boss/beginner');
    await user.click(screen.getByRole('button', { name: 'Begin battle' }));
    const q = nextBossQuestion(startBossBattle(golem, '1'), bossStagePools(golem, '1')) as QuizQuestion;
    await answer(user, q, false);
    await user.click(screen.getByRole('button', { name: /Retreat/ }));
    expect(screen.getByRole('heading', { name: 'You retreated' })).toBeInTheDocument();
    expect(useGameStore.getState().progress.bosses['boss-beginner']).toMatchObject({ attempts: 1, defeated: false });
  });
});
