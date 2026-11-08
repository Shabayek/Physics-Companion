import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Toaster, VISIBLE_TOASTS } from '../src/components/Toaster';
import { useGameStore } from '../src/store/useGameStore';

beforeEach(() => {
  vi.useFakeTimers();
  useGameStore.setState({ toasts: [] });
});
afterEach(() => vi.useRealTimers());

describe('Toaster', () => {
  it('auto-dismisses after 5 s, but pauses while hovered', () => {
    act(() => useGameStore.getState().notify({ kind: 'info', title: 'Hello' }));
    render(<Toaster />);
    const toast = screen.getByText('Hello').closest('li') as HTMLElement;
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText('Hello')).toBeInTheDocument();
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  it('errors stay until dismissed; only a few toasts are visible at once', () => {
    act(() => {
      useGameStore.getState().notify({ kind: 'error', title: 'Broken' });
      for (let i = 0; i < 4; i++) useGameStore.getState().notify({ kind: 'info', title: `Info ${i}` });
    });
    render(<Toaster />);
    expect(screen.getByLabelText('Notifications').querySelectorAll('li')).toHaveLength(VISIBLE_TOASTS);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
  });
});
