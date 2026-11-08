import '@testing-library/jest-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Robustness checks (scripts/stress-tests.sh) can pin "now" for the whole suite:
//   TEST_NOW=2026-11-07T23:59:58 npm run test      (no "Z" = local time in $TZ)
// The clock then starts at that instant for every test, exercising date edges (midnight, DST, year end…).
const testNow = process.env.TEST_NOW;
if (testNow) {
  const instant = new Date(testNow);
  if (Number.isNaN(instant.getTime())) throw new Error(`Invalid TEST_NOW: ${testNow}`);
  beforeEach(() => {
    vi.setSystemTime(instant);
  });
}

afterEach(() => {
  cleanup();
});
