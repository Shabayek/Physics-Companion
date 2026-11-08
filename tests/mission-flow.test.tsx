import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MissionPage from '../src/features/mission/MissionPage';
import { Toaster } from '../src/components/Toaster';
import { setGameClock, useGameStore } from '../src/store/useGameStore';
import { fixedClock } from '../src/lib/time';
import { getMission } from '../src/data/missions';
import { buildMissionQuiz } from '../src/game/engine/questions';
import type { Mission } from '../src/types';
import { rightAnswer, wrongAnswer } from './helpers/answers';

const clock = fixedClock(1_800_000_000_000);
const speedRacer = getMission('b-speed') as Mission;

function renderMission(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/mission/${id}`]}>
      <Routes>
        <Route path="/mission/:id" element={<MissionPage />} />
      </Routes>
      <Toaster />
    </MemoryRouter>,
  );
}

/** Plays the quiz for attempt `seed`, spending `secondsEach` per question. */
async function playSpeedRacer(opts: { correct: boolean; secondsEach: number; seed: string; hintsOnFirst?: number }) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Practice →' }));
  await user.click(screen.getByRole('button', { name: 'Take Quiz →' }));
  const questions = buildMissionQuiz(speedRacer, opts.seed);
  for (const [i, q] of questions.entries()) {
    expect(screen.getByRole('heading', { level: 2, name: q.prompt })).toBeInTheDocument();
    if (i === 0) for (let h = 0; h < (opts.hintsOnFirst ?? 0); h++) await user.click(screen.getByRole('button', { name: /hint/i }));
    const answer = opts.correct ? rightAnswer(q) : wrongAnswer(q);
    if (q.type === 'numeric') await user.type(screen.getByRole('textbox'), answer);
    else await user.click(screen.getByRole('radio', { name: answer }));
    clock.set(clock.now() + opts.secondsEach * 1000);
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await user.click(screen.getByRole('button', { name: i === questions.length - 1 ? 'See results' : 'Next question →' }));
  }
  return user;
}

beforeEach(() => {
  useGameStore.getState().reset();
  useGameStore.setState({ toasts: [] });
  setGameClock(clock);
});

describe('mission flow (UI → engine → store)', () => {
  it('a perfect quiz shows 3 stars, pays out once and raises a toast', async () => {
    renderMission('b-speed');
    await playSpeedRacer({ correct: true, secondsEach: 3, seed: '1' });

    const result = screen.getByTestId('mission-result');
    expect(within(result).getByLabelText('3 of 3 stars')).toBeInTheDocument();
    expect(within(result).getByText('Correct: 4/4', { exact: false })).toBeInTheDocument();
    expect(within(result).getByText('First clear! Quanta earned: 10')).toBeInTheDocument();
    expect(within(result).getByText(/Speed bonus/)).toBeInTheDocument();
    // 10 for the mission + 10 (First Steps) + 10 (Flawless Logic)
    expect(useGameStore.getState().progress.currency).toBe(30);

    const notifications = screen.getByLabelText('Notifications');
    expect(within(notifications).getByText('Mission complete: Speed Racer')).toBeInTheDocument();
    expect(within(notifications).getByText('Badge earned')).toBeInTheDocument();
    // Only 2 toasts at a time; the rest wait in the queue until earlier ones are dismissed.
    expect(within(notifications).queryByText('Streak started!')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(notifications).getByRole('button', { name: 'Dismiss: Badge earned' }));
    expect(within(notifications).getByText('Streak started!')).toBeInTheDocument();
    await user.click(within(notifications).getByRole('button', { name: 'Dismiss: Streak started!' }));
    expect(within(notifications).getByText('Achievement unlocked: First Steps')).toBeInTheDocument();
  });

  it('uses the real answering time (slow quiz → no speed bonus)', async () => {
    renderMission('b-speed');
    await playSpeedRacer({ correct: true, secondsEach: 30, seed: '1' });
    expect(screen.queryByText(/Speed bonus/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('3 of 3 stars')).toBeInTheDocument();
  });

  it('a failed quiz pays nothing and explains why', async () => {
    renderMission('b-speed');
    await playSpeedRacer({ correct: false, secondsEach: 3, seed: '1' });
    expect(screen.getByLabelText('0 of 3 stars')).toBeInTheDocument();
    expect(screen.getByText('Earn at least 1★ to collect rewards.')).toBeInTheDocument();
    expect(useGameStore.getState().progress.currency).toBe(0);
    expect(useGameStore.getState().progress.collection.badges).toEqual([]);
  });

  it('retrying uses a new seed (fresh numbers) and pays the replay reward', async () => {
    renderMission('b-speed');
    const user = await playSpeedRacer({ correct: true, secondsEach: 3, seed: '1' });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await playSpeedRacer({ correct: true, secondsEach: 3, seed: '2' });
    expect(screen.getByText('Replay reward: 2 Quanta')).toBeInTheDocument();
    expect(useGameStore.getState().progress.currency).toBe(32);
  });

  it('hints are reported on the result screen and counted in stats', async () => {
    renderMission('b-speed');
    await playSpeedRacer({ correct: true, secondsEach: 3, seed: '1', hintsOnFirst: 2 });
    expect(screen.getByText('Hints used: 2')).toBeInTheDocument();
    expect(useGameStore.getState().progress.stats.hintsUsed).toBe(2);
  });

  it('toasts can be dismissed', async () => {
    const user = userEvent.setup();
    useGameStore.getState().notify({ kind: 'info', title: 'Hello' });
    render(<Toaster />);
    await user.click(screen.getByRole('button', { name: 'Dismiss: Hello' }));
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });
});
