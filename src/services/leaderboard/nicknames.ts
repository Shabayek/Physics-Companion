// Display names. Kid mode only allows generated nicknames ("Quantum Otter 42") — no free text.
// The word lists must match the server's `kid_name_words` seed (checked by a unit test).
import type { Rng } from '../../lib/rng';
import { LEADERBOARD_RULES } from './rules';

export const KID_ADJECTIVES = [
  'Quantum', 'Cosmic', 'Atomic', 'Stellar', 'Electric', 'Magnetic', 'Sonic', 'Radiant',
  'Orbital', 'Nimble', 'Curious', 'Brave', 'Clever', 'Swift', 'Bright', 'Gentle',
] as const;

export const KID_ANIMALS = [
  'Otter', 'Panda', 'Falcon', 'Dolphin', 'Koala', 'Fox', 'Owl', 'Lynx',
  'Turtle', 'Penguin', 'Tiger', 'Whale', 'Badger', 'Hedgehog', 'Robin', 'Gecko',
] as const;

export function generateNickname(rng: Rng): string {
  return `${rng.pick(KID_ADJECTIVES)} ${rng.pick(KID_ANIMALS)} ${rng.int(1, 99)}`;
}

/** Client-side mirror of `display_name_error` (the server also checks a word blocklist). */
export function displayNameError(raw: string, kidMode: boolean): string | null {
  const name = raw.trim();
  if (name.length < LEADERBOARD_RULES.NAME_MIN || name.length > LEADERBOARD_RULES.NAME_MAX) return 'name_length';
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(name) || name.includes('  ')) return 'name_chars';
  if (kidMode) {
    const parts = name.split(' ');
    if (
      parts.length !== 3 ||
      !/^\d{1,3}$/.test(parts[2] ?? '') ||
      !(KID_ADJECTIVES as readonly string[]).includes(parts[0] ?? '') ||
      !(KID_ANIMALS as readonly string[]).includes(parts[1] ?? '')
    ) {
      return 'name_not_generated';
    }
  }
  return null;
}

export function describeNameError(code: string): string {
  switch (code) {
    case 'name_length':
      return `Names must be ${LEADERBOARD_RULES.NAME_MIN}–${LEADERBOARD_RULES.NAME_MAX} characters.`;
    case 'name_chars':
      return 'Use letters, numbers, spaces, dots, dashes or underscores (starting with a letter or number).';
    case 'name_blocked':
      return 'Please choose a different name.';
    case 'name_taken':
      return 'That name is already taken.';
    case 'name_not_generated':
      return 'Pick one of the generated nicknames.';
    default:
      return 'The name could not be saved. Please try again.';
  }
}
