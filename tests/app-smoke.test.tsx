import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import App from '../src/App';
import { useGameStore } from '../src/store/useGameStore';

beforeEach(() => {
  window.history.pushState({}, '', '/');
  useGameStore.getState().reset();
});

describe('app smoke test', () => {
  it('every page is reachable from the main navigation', async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const pages: [string, string][] = [
      ['Challenge', 'Challenge Mode'],
    ['Lab', 'Free-Play Lab'],
      ['Codex', 'Laws & Constants Codex'],
    ['Leaderboard', 'Leaderboard'],
    ['Achievements', 'Achievements'],
      ['Collection', 'Collection'],
      ['Profile', 'Profile'],
      ['Settings', 'Settings'],
      ['Home', 'Welcome, Explorer!'],
    ];
    for (const [link, heading] of pages) {
      await user.click(within(nav).getByRole('link', { name: link }));
      // Pages are code-split: wait for the lazily loaded route.
      expect(await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 5000 })).toBeInTheDocument();
      expect(within(nav).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page');
    }
  });

  it('settings show offline mode when no backend is configured', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Settings' }));
    expect(await screen.findByTestId('backend-status', {}, { timeout: 5000 })).toHaveTextContent('Offline mode');
  });

  it('text size setting scales the root font size; the page title follows the main heading', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(document.documentElement).toHaveClass('text-size-md');
    act(() => useGameStore.getState().setSettings({ textSize: 'lg' }));
    expect(document.documentElement).toHaveClass('text-size-lg');
    expect(document.documentElement).not.toHaveClass('text-size-md');
    await user.click(screen.getByRole('link', { name: 'Codex' }));
    await screen.findByRole('heading', { level: 1, name: 'Laws & Constants Codex' }, { timeout: 5000 });
    await waitFor(() => expect(document.title).toBe('Laws & Constants Codex · Physics Companion'));
    expect(screen.getByRole('main')).toHaveFocus(); // focus moves to the new page
  });

  it('regression: in StrictMode (double effects) the first render does not steal focus', () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    expect(screen.getByRole('main')).not.toHaveFocus();
  });

  it('has a skip link to the main content', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('the in-app reduced-motion setting is applied to the document', async () => {
    render(<App />);
    expect(document.documentElement).not.toHaveClass('reduce-motion');
    act(() => useGameStore.getState().setSettings({ reducedMotion: true }));
    expect(document.documentElement).toHaveClass('reduce-motion');
  });
});
