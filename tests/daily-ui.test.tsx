import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DailyPage from '../src/features/daily/DailyPage';
import { DailyCard } from '../src/features/daily/DailyCard';
import { TopBar } from '../src/components/TopBar';
import { setGameClock, useGameStore } from '../src/store/useGameStore';
import { fixedClock } from '../src/lib/time';
import { buildDailyChallenge } from '../src/game/engine/daily';
import { defaultProgress } from '../src/game/engine/progress';
import { rightAnswer } from './helpers/answers';

// 10:00 local time on 2026-11-07 → 14 h until the next challenge.
const clock = fixedClock(new Date(2026, 10, 7, 10, 0, 0).getTime());

beforeEach(() => {
  clock.set(new Date(2026, 10, 7, 10, 0, 0).getTime());
  setGameClock(clock);
  useGameStore.getState().reset();
  useGameStore.setState({ toasts: [] });
});

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/daily']}>
      <TopBar />
      <Routes>
        <Route path="/daily" element={<DailyPage />} />
      </Routes>
      <DailyCard />
    </MemoryRouter>,
  );
}

describe('daily challenge UI', () => {
  it('preview → play → reward breakdown → completed card with countdown → streak chip', async () => {
    // An existing 6-day streak from yesterday: today is day 7 → chest!
    useGameStore.getState().setProgress({ ...defaultProgress(), streak: { current: 6, longest: 6, lastActiveDate: '2026-11-06' } });
    useGameStore.setState({ toasts: [] });
    const user = userEvent.setup();
    renderApp();

    expect(screen.getByRole('link', { name: 'Streak: 6 days — play today to keep it' })).toBeInTheDocument();
    const preview = screen.getByRole('table', { name: 'Reward preview' });
    expect(within(preview).getByText('+70%')).toBeInTheDocument();
    expect(within(preview).getByText('+100 today!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start challenge' }));
    const questions = buildDailyChallenge('2026-11-07', 'beginner');
    for (const [i, q] of questions.entries()) {
      const a = rightAnswer(q);
      if (q.type === 'numeric') await user.type(screen.getByRole('textbox'), a);
      else await user.click(screen.getByRole('radio', { name: a }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));
      await user.click(screen.getByRole('button', { name: i === questions.length - 1 ? 'See results' : 'Next question →' }));
    }

    const result = screen.getByTestId('daily-result');
    const rewards = within(result).getByRole('table', { name: 'Rewards' });
    expect(within(rewards).getByText('Streak bonus (+70%)')).toBeInTheDocument();
    expect(within(rewards).getByText('🎁 Streak chest')).toBeInTheDocument();
    // 20 base + 14 streak + 10 perfect + 100 chest
    expect(within(rewards).getByText('144')).toBeInTheDocument();
    expect(within(result).getByText('🔥 Streak: 7 days')).toBeInTheDocument();
    expect(within(result).getByRole('timer')).toHaveTextContent('14:00:00');

    expect(screen.getByRole('link', { name: 'Streak: 7 days' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: '📅 Daily Challenge' });
    expect(within(card).getByText(/Completed today: 5\/5 correct/)).toBeInTheDocument();
    expect(within(card).getByRole('timer')).toHaveTextContent('14:00:00');
  });

  it('after completing, the page offers practice without rewards', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Start challenge' }));
    for (const [i, q] of buildDailyChallenge('2026-11-07', 'beginner').entries()) {
      if (q.type === 'numeric') await user.type(screen.getByRole('textbox'), '-1');
      else await user.click(screen.getByRole('radio', { name: q.options?.find((o) => o !== q.answer) ?? '' }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));
      await user.click(screen.getByRole('button', { name: i === 4 ? 'See results' : 'Next question →' }));
    }
    const before = useGameStore.getState().progress.currency;
    await user.click(screen.getByRole('button', { name: 'Practice again' }));
    for (const [i, q] of buildDailyChallenge('2026-11-07', 'beginner').entries()) {
      const a = rightAnswer(q);
      if (q.type === 'numeric') await user.type(screen.getByRole('textbox'), a);
      else await user.click(screen.getByRole('radio', { name: a }));
      await user.click(screen.getByRole('button', { name: 'Check answer' }));
      await user.click(screen.getByRole('button', { name: i === 4 ? 'See results' : 'Next question →' }));
    }
    expect(screen.getByRole('heading', { name: 'Practice complete' })).toBeInTheDocument();
    // The practice run itself pays nothing; the only change is the "On a Roll" achievement (5 in a row, +10).
    expect(useGameStore.getState().progress.achievements['on-a-roll']).toBeDefined();
    expect(useGameStore.getState().progress.currency).toBe(before + 10);
  });
});
