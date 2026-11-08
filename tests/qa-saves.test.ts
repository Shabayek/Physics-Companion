// The QA save files in docs/qa-saves must stay importable as the save format evolves.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProgressStrict } from '../src/game/engine/schema';
import { bossUnlockStatus } from '../src/game/engine/boss';

const dir = join(__dirname, '..', 'docs', 'qa-saves');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

describe('QA save files', () => {
  it.each(files)('%s imports cleanly', (file) => {
    const result = parseProgressStrict(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    expect(result.ok, result.ok ? '' : result.error).toBe(true);
  });

  it('the boss-ready save really has the beginner boss available', () => {
    const result = parseProgressStrict(JSON.parse(readFileSync(join(dir, '1-beginner-boss-ready.json'), 'utf8')));
    if (!result.ok) throw new Error(result.error);
    expect(bossUnlockStatus(result.progress, 'beginner').unlocked).toBe(true);
  });
});
