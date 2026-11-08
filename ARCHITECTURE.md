# Architecture

## Layers

- `src/types` — shared TypeScript models
- `src/game/engine` — pure, framework-agnostic logic with unit tests
  - `physics.ts` — physics formulas
  - `scoring.ts` — quiz scoring (stars from accuracy, speed bonus, answer streaks)
  - `quiz.ts` — answer grading and numeric parsing (DOM-free; reusable server-side)
  - `questions.ts` — question bank: `buildMissionQuiz`, `buildQuestionSet`, `questionById`
  - `questionTypes.ts` — seeded generator contract (`params(rng)` + pure `build(params)`)
  - `hints.ts` — hint rules (tiers, −25% credit per paid hint, Kid mode free hint)
  - `boss.ts` — boss battle state machine, stage pools, replay/validation, unlock rules
  - `achievements.ts` — achievement evaluation (unlock, Quanta, badge), status for progress bars
  - `streak.ts` — daily streak over local calendar days (`recordActivity`, `viewStreak`)
  - `daily.ts` — daily challenge set per (date, tier), reward formula, countdown
  - `challenge.ts` — challenge-mode rules, pools, run state machine, replay/validation
  - `merge.ts` — three-way merge of saves for cloud sync (`mergeProgress`, `canonicalJson`)
  - `rewards.ts` — economy rules (first clear vs replay)
  - `progress.ts` — progress helpers (record mission, unlocks, collection)
  - `schema.ts` — save-format schema (zod/mini), v1→v2 upgrade, lenient repair + strict import validation
  - `events.ts` — **game-event reducer**: the single place where gameplay changes progress
- `src/data` — typed content
  - `missions/` — one file per world; each mission has hand-written concept questions and generator ids
  - `questions/generators.ts` — 29 seeded question generators (answers computed by `physics.ts`)
  - `bosses.ts` — the four world bosses (stages, taunts, rewards incl. Codex cards)
  - `achievements.ts` — achievement definitions (pure `progress(p) → {current, target}` functions)
  - `badges.ts` — display info for every badge id (achievement, boss, mission)
  - `constants.ts`, `laws.ts`
- `src/store` — Zustand store with localStorage persistence, event `dispatch`, transient toasts
- `src/services/backend` — online backend configuration and lazy Supabase client (optional)
- `src/services/leaderboard` — leaderboard facade (`index.ts`), online (`supabaseLeaderboard.ts`) and local
  implementations, offline queue, submission builder, client mirror of the server rules
- `src/services/cloud` — cloud save: sync engine (`sync.ts`), Supabase adapters incl. account linking
  (`supabaseCloud.ts`), facade with scheduling and status store (`index.ts`)
- `supabase/` — database migrations, SQL tests and setup guide (`supabase/README.md`)
- `src/components` — reusable UI (TopBar navigation, Toaster, Button, `quiz/QuizRunner`)
- `src/features` — route-level feature modules
- `src/lib` — utilities (`rng.ts` seeded RNG, `time.ts` clock + local date keys, `units.ts`, `cn.ts`)

## Gameplay data flow

```
UI event ──dispatch(GameEvent)──▶ store ──applyEvent(progress, event, { now })──▶ engine
                                    ◀── { progress, notices, outcome } ─────────────┘
store: saves progress, queues notices as toasts, returns the outcome to the screen
```

`applyEvent` is pure: it receives the time (`now`) instead of reading the clock, so every rule
(rewards, stats, unlocks, and later streaks/achievements) is unit-testable. The store reads time from
a replaceable `Clock` (`setGameClock`) so UI tests can control time too.

## Questions & quizzes

- Hand-written question ids: `<missionId>-c<n>`. Generated ids: `gen:<generatorId>:<seed>` — any generated
  question can be rebuilt from its id (`questionById`), which is what server-side validation will use.
- A mission quiz is `buildMissionQuiz(mission, seed)` with `seed` = attempt number, so every attempt gets
  fresh numbers but is reproducible. MCQ options are shuffled deterministically per seed.
- Numeric answers store the exact value; a player's answer is accepted within half a rounding step
  (`absTolerance`) or ±1% (`tolerance`). Units, decimal commas and thousands separators are accepted.
- `QuizRunner` produces one `AnswerRecord` per question (answer, hints used, answering time). The engine
  re-grades these against the quiz rebuilt from the seed — the UI's "correct" flag is never trusted.
- Score: 10 points × credit per question (credit = 1 − 0.25 × paid hints, min 0.25), a speed bonus based on
  answering time only (not time reading feedback), and +2 per answer in the longest correct streak.
  Stars come from total credit ÷ number of questions (≥90% 3★, ≥60% 2★, ≥30% 1★).

## Progression

- A world's boss appears when 60% of its missions are completed; defeating it unlocks the next world.
- Boss battles are deterministic for a seed (attempt number): the reducer replays the whole battle from the
  answer log (`replayBossBattle`), re-grading every answer, before granting anything.

## Achievements

`applyEvent` runs every event's handler, then updates the streak (any event with ≥1 correct answer
counts as activity for `ctx.today`, the local date) and finally `evaluateAchievements` — one place for
all progression side effects.
A definition's `progress` function drives unlocking, the progress bar and retroactive awards: the store
evaluates achievements when a save is loaded or imported, so old progress is credited automatically.

## Timers

Challenge timers are derived from timestamps (`gameNow()`), never from counting ticks; `useNow(ms)` only
re-renders. The engine checks each answer's `timeMs` (+ hint penalties) against the limits, so runs can be
re-validated from their answer log. Accessibility: Relaxed (×1.5) and Untimed options (WCAG 2.2.1).

## State & persistence

- `Progress` (save format v2) is persisted under `physics-companion-progress`.
- On every load, stored data passes through `salvageProgress`: legacy saves are upgraded, missing fields
  get defaults and invalid parts are repaired field by field (never throws).
- Imported files go through `parseProgressStrict`, which rejects wrong types with a readable error.
- The schema and the `Progress` type are checked against each other at compile time.

## Online backend

Configured by `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example` and `supabase/README.md`).
Without them the app runs fully offline and the leaderboard shows personal bests stored on the device.

```
game event ─▶ store.dispatch ─▶ subscribeGameEvents listeners (side effects, outside the pure reducer)
                                   └─ leaderboard: buildSubmission → checkSubmission (mirror of SQL rules)
                                        → offline queue (localStorage) → submit_score RPC (validated in SQL)
```

supabase-js is loaded with a dynamic import only when configured. Players sign in anonymously on their
first write; a cached profile lets runs queue while offline.

Cloud save (opt-in): the device stores sync metadata (account, revision, and the last synced version as
the merge *base*). A sync reads the cloud save; if only one side changed it uploads or downloads,
otherwise it applies `mergeProgress(base, local, remote)` and uploads with the expected revision, retrying
on conflicts. Syncs run on start, 4 s after local changes, on focus and when the connection returns.

## Routing

React Router (Home, World, Mission, Boss, Daily, Challenge, Leaderboard, Lab, Codex, Achievements,
Collection, Profile, Settings). Every page except Home is code-split (`React.lazy`); supabase-js is a
separate chunk loaded only when online features are configured. The game engine and content are part of
the initial bundle because loading a save already runs the game rules (migration, retroactive awards).

## Accessibility

- Themes are CSS custom properties (`--fg`, `--muted`, `--link`, `--primary-*`, `--tier-*`…) defined for
  dark, light and high-contrast; text colours meet WCAG AA (axe E2E test on every page and key interactive
  states in all themes).
- Skip link, `<main>` focus and document title updates on navigation (`RouteEffects` in `App.tsx`),
  labelled landmarks, live regions for toasts/timers/quiz feedback, real radio inputs in quizzes,
  keyboard shortcuts in challenge mode.
- Settings: text size (root font size; Tailwind is rem-based), reduced motion, Kid mode, challenge timing
  (Relaxed ×1.5 / Untimed). Toasts pause on hover/focus; errors stay until dismissed.

## Testing

- Vitest + Testing Library: `tests/**/*.test.{ts,tsx}` — engine units, schema/migration, store persistence,
  UI integration (mission flow, app navigation).
- Playwright: `tests/e2e` — `npm run test:e2e` (needs `npx playwright install chromium`) or
  `npm run test:e2e:sandbox`, which installs Chromium into a temp folder (Playwright CDN, or Debian packages
  as a fallback for restricted networks). See `scripts/e2e-sandbox.sh` for options.
- Shared test helpers live in `tests/helpers` (answers, boss/challenge simulators, seeded storage,
  an HTTP-level fake Supabase for E2E).
- Database: `npm run test:db` — SQL tests against a throwaway local PostgreSQL with a Supabase shim.
- E2E projects: `chromium` (offline app), `mobile` (Pixel 5 viewport, touch) and `online` (a second build
  pointed at the fake Supabase). Tests run against production bundles (`vite preview`) on free ports;
  `E2E_SERVER=dev` switches to the dev server. Accessibility audits use `@axe-core/playwright`.
- Robustness: `npm run test:stress` reruns the suites on a slow machine, in other time zones/locales, at
  pinned dates (`TEST_NOW`), in random order and under parallel load.
- See `docs/TESTING.md` for the full test guide.
