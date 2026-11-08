import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ChallengePage from '../src/features/challenge/ChallengePage';
import { setGameClock, useGameStore } from '../src/store/useGameStore';
import { fixedClock } from '../src/lib/time';
import { challengePool } from '../src/game/engine/challenge';
import type { QuizQuestion } from '../src/types';
import { rightAnswer } from './helpers/answers';

const clock = fixedClock(new Date(2026, 10, 7, 10, 0, 0).getTime());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/challenge" element={<ChallengePage />} />
        <Route path="/challenge/:mode" element={<ChallengePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function answerRight(user: UserEvent, q: QuizQuestion) {
  const a = rightAnswer(q);
  if (q.type === 'numeric') {
    await user.type(screen.getByRole('textbox'), `${a}{Enter}`);
  } else {
    await user.click(screen.getByRole('button', { name: new RegExp(`^\\d\\. ${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }));
  }
}

beforeEach(() => {
  clock.set(new Date(2026, 10, 7, 10, 0, 0).getTime());
  setGameClock(clock);
  useGameStore.getState().reset();
  useGameStore.setState({ toasts: [] });
});

describe('challenge hub', () => {
  it('timing selector updates the rules text and is saved to settings', async () => {
    const user = userEvent.setup();
    renderAt('/challenge');
    const blitz = screen.getByRole('region', { name: /Blitz/ });
    expect(within(blitz).getByText(/in 60 s/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Relaxed (×1.5 time)' }));
    expect(within(blitz).getByText(/in 90 s/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Untimed' }));
    expect(within(blitz).getByText(/Answer 20 questions at your own pace/)).toBeInTheDocument();
    expect(useGameStore.getState().progress.settings.challengeTiming).toBe('untimed');
  });
});

describe('challenge runs', () => {
  it('Sprint: correct answer, a timeout, a keyboard shortcut, then results with review', async () => {
    const user = userEvent.setup();
    renderAt('/challenge/sprint');
    await user.click(screen.getByRole('button', { name: 'Go!' }));
    const pool = challengePool('sprint', 'beginner', 'sprint:standard:run1');

    // Q1: correct after 2 s
    expect(screen.getByRole('heading', { level: 2, name: pool[0]?.prompt })).toBeInTheDocument();
    clock.set(clock.now() + 2000);
    await answerRight(user, pool[0] as QuizQuestion);
    expect(screen.getByTestId('challenge-flash')).toHaveTextContent(/✓ \+\d+/);
    expect(screen.getByText('Question 2 of 10')).toBeInTheDocument();

    // Q2: let the 20 s timer run out → counted as wrong automatically
    clock.set(clock.now() + 21000);
    expect(await screen.findByText('Question 3 of 10')).toBeInTheDocument();
    expect(screen.getByTestId('challenge-flash')).toHaveTextContent('✗ Answer:');

    // Q3: keyboard shortcut (choice questions) or typed answer
    const q3 = pool[2] as QuizQuestion;
    if (q3.type === 'numeric') await answerRight(user, q3);
    else await user.keyboard(String((q3.options ?? []).indexOf(String(q3.answer)) + 1));
    expect(screen.getByText('Question 4 of 10')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /End run/ }));
    const result = screen.getByTestId('challenge-result');
    expect(within(result).getByText('Run ended')).toBeInTheDocument();
    expect(within(result).getByText(/Correct: 2\/3/)).toBeInTheDocument();
    await user.click(screen.getByText('Review your answers (3)'));
    expect(screen.getByText('Your answer: (time ran out)', { exact: false })).toBeInTheDocument();
    expect(useGameStore.getState().progress.challenge.runs).toBe(1);
  });

  it('Blitz ends when the clock runs out', async () => {
    const user = userEvent.setup();
    renderAt('/challenge/blitz');
    await user.click(screen.getByRole('button', { name: 'Go!' }));
    expect(screen.getByRole('timer')).toHaveTextContent('60 s');
    clock.set(clock.now() + 61000);
    expect(await screen.findByText('Time’s up!')).toBeInTheDocument();
    expect(useGameStore.getState().progress.challenge.best).toEqual({});
  });

  it('Survival shows lives and ends after three misses', async () => {
    const user = userEvent.setup();
    renderAt('/challenge/survival');
    await user.click(screen.getByRole('button', { name: 'Go!' }));
    expect(screen.getByRole('img', { name: 'Lives: 3 of 3' })).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      clock.set(clock.now() + 31000);
      if (i < 2) expect(await screen.findByRole('img', { name: `Lives: ${2 - i} of 3` })).toBeInTheDocument();
    }
    expect(await screen.findByText('Out of lives!')).toBeInTheDocument();
  });
});
