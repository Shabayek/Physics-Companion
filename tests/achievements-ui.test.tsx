import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Achievements from '../src/features/achievements/Achievements';
import Collection from '../src/features/collection/Collection';
import { useGameStore } from '../src/store/useGameStore';
import { ACHIEVEMENTS } from '../src/data/achievements';
import { ALL_MISSIONS } from '../src/data/missions';
import { defaultProgress, recordMission } from '../src/game/engine/progress';

beforeEach(() => {
  let p = defaultProgress();
  for (const m of ALL_MISSIONS.slice(0, 4)) p = recordMission(p, m.id, 3, 40, 1);
  useGameStore.getState().setProgress(p); // awards First Steps retroactively
  useGameStore.setState({ toasts: [] });
});

describe('Achievements page', () => {
  it('shows totals, unlocked cards, progress bars and hides secrets', async () => {
    render(<MemoryRouter><Achievements /></MemoryRouter>);
    expect(screen.getByText(`of ${ACHIEVEMENTS.length} unlocked`, { exact: false })).toHaveTextContent(`1 of ${ACHIEVEMENTS.length} unlocked · 10 Quanta`);

    const firstSteps = screen.getByRole('article', { name: 'First Steps' });
    expect(within(firstSteps).getByText(/✓ Unlocked/)).toBeInTheDocument();

    const explorer = screen.getByRole('article', { name: 'Explorer' });
    expect(within(explorer).getByRole('progressbar', { name: 'Explorer progress' })).toHaveAttribute('aria-valuenow', '4');
    expect(within(explorer).getByText('4/10 · Reward: 25 Quanta')).toBeInTheDocument();

    // Secret achievements reveal nothing until unlocked.
    expect(screen.queryByRole('article', { name: 'Clutch' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: 'Secret achievement' }).length).toBe(ACHIEVEMENTS.filter((a) => a.secret).length);
  });

  it('filters unlocked / in progress', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Achievements /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Unlocked' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'In progress' }));
    expect(screen.getAllByRole('article')).toHaveLength(ACHIEVEMENTS.length - 1);
    expect(screen.getByRole('button', { name: 'In progress' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Collection page', () => {
  it('shows named badges grouped by source with counts', () => {
    useGameStore.getState().setProgress({
      ...useGameStore.getState().progress,
      collection: { ...useGameStore.getState().progress.collection, badges: ['ach-first-steps', 'badge-b-speed', 'legacy-thing'] },
    });
    render(<MemoryRouter><Collection /></MemoryRouter>);
    const missions = screen.getByRole('region', { name: 'Mission badges' });
    expect(within(missions).getByRole('heading', { name: 'Mission badges (1/31)' })).toBeInTheDocument();
    expect(within(missions).getByText('Speed Racer').closest('li')).toHaveTextContent('earned');
    expect(within(missions).getByText('Gravity Drop').closest('li')).toHaveTextContent('not earned yet');
    expect(screen.getByRole('region', { name: 'Achievement badges' })).toHaveTextContent('First Steps');
    expect(screen.getByRole('region', { name: 'Other badges' })).toHaveTextContent('legacy-thing');
  });
});
