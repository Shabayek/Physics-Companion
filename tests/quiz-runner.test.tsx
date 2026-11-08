import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuizRunner } from '../src/components/quiz/QuizRunner';
import { fixedClock } from '../src/lib/time';
import type { AnswerRecord, QuizQuestion } from '../src/types';

const mcq: QuizQuestion = {
  id: 'q1', type: 'mcq', prompt: 'Pick B', options: ['A', 'B', 'C'], answer: 'B',
  explanation: 'B is right because reasons.', hints: ['Not A.', 'Not C.'], difficulty: 1,
};
const numeric: QuizQuestion = {
  id: 'q2', type: 'numeric', prompt: 'How much is 2 × 2.5?', answer: 5, absTolerance: 0.05, unit: 'm',
  answerText: '5.0 m', explanation: '2 × 2.5 = 5.', hints: ['Multiply.', 'a × b', '2 × 2.5'], difficulty: 2,
};

function setup(props: Partial<Parameters<typeof QuizRunner>[0]> = {}) {
  const clock = fixedClock(0);
  const onFinish = vi.fn<(a: AnswerRecord[]) => void>();
  const onAnswer = vi.fn();
  render(<QuizRunner questions={[mcq, numeric]} onFinish={onFinish} onAnswer={onAnswer} now={clock.now} {...props} />);
  return { user: userEvent.setup(), clock, onFinish, onAnswer };
}

describe('QuizRunner', () => {
  it('one question at a time with progress, feedback and explanation', async () => {
    const { user, onFinish, onAnswer } = setup();
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pick B' })).toBeInTheDocument();
    expect(screen.queryByText('How much is 2 × 2.5?')).not.toBeInTheDocument();

    const check = screen.getByRole('button', { name: 'Check answer' });
    expect(check).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'A' }));
    await user.click(check);

    expect(screen.getByTestId('quiz-feedback')).toHaveTextContent('✗ Not quite. Correct answer: B');
    expect(screen.getByTestId('quiz-feedback')).toHaveTextContent('B is right because reasons.');
    expect(screen.getByRole('radio', { name: 'A' })).toBeDisabled();
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ questionId: 'q1', answer: 'A', correct: false }), 0);

    await user.click(screen.getByRole('button', { name: 'Next question →' }));
    expect(screen.getByText('Question 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How much is 2 × 2.5?' })).toHaveFocus();

    await user.type(screen.getByRole('textbox', { name: 'Your answer in m' }), '5 m{Enter}');
    expect(screen.getByTestId('quiz-feedback')).toHaveTextContent('✓ Correct!');
    await user.click(screen.getByRole('button', { name: 'See results' }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]?.[0].map((r) => [r.questionId, r.correct])).toEqual([['q1', false], ['q2', true]]);
  });

  it('reveals hints tier by tier, shows their cost and records how many were used', async () => {
    const { user, onFinish } = setup({ questions: [numeric] });
    await user.click(screen.getByRole('button', { name: /Hint \(−25%\)/ }));
    expect(screen.getByRole('list', { name: 'Hints' })).toHaveTextContent('Hint 1: Multiply.');
    await user.click(screen.getByRole('button', { name: /Hint \(−25%\)/ }));
    await user.click(screen.getByRole('button', { name: /Hint \(−25%\)/ }));
    expect(screen.getByRole('list', { name: 'Hints' })).toHaveTextContent('Hint 3: 2 × 2.5');
    expect(screen.queryByRole('button', { name: /Hint/ })).not.toBeInTheDocument(); // all tiers used
    await user.type(screen.getByRole('textbox'), '5');
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await user.click(screen.getByRole('button', { name: 'See results' }));
    expect(onFinish.mock.calls[0]?.[0][0]).toMatchObject({ hintsUsed: 3, freeHints: 0 });
  });

  it('Kid mode: the first hint is labelled free', async () => {
    const { user } = setup({ questions: [numeric], freeHints: 1 });
    await user.click(screen.getByRole('button', { name: /Free hint/ }));
    expect(screen.getByRole('button', { name: /Hint \(−25%\)/ })).toBeInTheDocument();
  });

  it('answering time excludes time spent reading feedback', async () => {
    const { user, clock, onFinish } = setup();
    clock.set(3000);
    await user.click(screen.getByRole('radio', { name: 'B' }));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    clock.set(60_000); // reading the explanation for a long time
    await user.click(screen.getByRole('button', { name: 'Next question →' }));
    clock.set(65_000);
    await user.type(screen.getByRole('textbox'), '5');
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await user.click(screen.getByRole('button', { name: 'See results' }));
    expect(onFinish.mock.calls[0]?.[0].map((r) => r.timeMs)).toEqual([3000, 5000]);
  });

  it('radio options support keyboard selection', async () => {
    const { user } = setup({ questions: [mcq] });
    await user.tab();
    expect(screen.getByRole('radio', { name: 'A' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'B' })).toBeChecked();
  });
});
