# Testing the platform

Physics Companion is tested at four levels: pure engine/unit tests, UI integration tests, database tests
and real-browser end-to-end tests. A manual walkthrough at the end covers what a human should look at
before a release.

## 1. One command

```bash
npm ci
npm run verify        # typecheck + lint + unit/integration + database + production build
npm run verify:all    # the above + every browser test (installs Chromium into a temp folder if needed)
```

Requirements: Node 22 (see `.nvmrc`), and PostgreSQL 16 server binaries for the database tests
(`apt install postgresql`, `brew install postgresql@16`; set `PG_BIN` if they are not found). Run them as a
regular user (PostgreSQL refuses to start as root). No Docker is needed anywhere.

## 2. Automated suites

| Suite | Command | Size | What it covers |
|---|---|---|---|
| Unit & integration | `npm run test` | 34 files, 465 tests | Engine rules, content validation, UI flows with Testing Library |
| Database | `npm run test:db` | 10 SQL test groups | Supabase migrations: privileges, RLS, validation, rankings, cloud save |
| Browser (E2E) | `npm run test:e2e:sandbox` | 74 tests in 3 Playwright projects (~3 min) | Real Chromium: desktop, mobile (Pixel 5), online (fake Supabase) |
| Robustness | `npm run test:stress` | 19+ runs of the suites | The suites under other machines' conditions (see §3) |

### Unit & integration (`tests/*.test.ts(x)`)

- **Engine:** scoring & hints (`scoring`, `hints`), grading and numeric parsing (`generators`), the event
  reducer incl. re-grading of forged answers (`events`), bosses (`boss`), daily challenge & streaks
  (`daily`, `streak`, `timezone` — runs under America/New_York with DST), challenge mode (`challenge`,
  `challenge-events`), achievements (`achievements` — including "every achievement is achievable"),
  three-way merge for cloud save (`merge`).
- **Content:** every mission/question is well-formed (`content`); each of the 29 generators is checked on
  300 seeds — it must accept its own displayed answer, reject wrong ones and be rebuildable from its id
  (`generators`); physics spot checks with known inputs.
- **Saves:** schema, v1→v2 migration, repair of corrupted data, strict import validation (`schema`),
  persistence in localStorage (`store-persistence`), QA save files stay importable (`qa-saves`).
- **Online (client side):** submission building and the client mirror of the server rules, offline queue,
  local board, Supabase adapter (`leaderboard-client`), game events → leaderboard incl. offline
  (`leaderboard-integration`), cloud sync engine with a fake cloud and several devices (`cloud-sync`),
  cloud panel, parental gate, auto-sync (`cloud-ui`).
- **Contract:** the SQL migrations' constants, Kid-mode word lists and RPC signatures must match the client
  (`leaderboard-contract`) — so the client never sends something the server would reject.
- **UI:** quiz runner, mission/boss/daily/challenge flows, achievements & collection pages, leaderboard page,
  toasts, app navigation, skip link, focus and title management (`*-ui`, `*-flow`, `app-smoke`,
  `toaster`, `quiz-runner`).

### Database (`supabase/tests/*.test.sql`)

`scripts/db-test.sh` starts a throwaway PostgreSQL, loads `supabase_shim.sql` (Supabase roles and
`auth.uid()`), applies every migration **twice** (they must be idempotent) and runs the SQL tests. They
act as signed-in players and check: no direct writes and no reading other players' rows; name rules;
every rejection path of `submit_score` (inconsistent logs, impossible times, per-mode limits, daily window,
duplicates, rate limit); rankings (best per player, ties, private players, weekly, boss by time); cloud
save concurrency, throttling, size limit and privacy; deleting data.

### Browser (`tests/e2e/**`)

`npm run test:e2e:sandbox` (or `npm run test:e2e` if Playwright's browsers are installed) builds the app
twice and serves the production bundles with `vite preview` — one offline, one pointed at a fake Supabase —
on free ports (never reusing a server that is already running), then runs three projects. Set
`E2E_SERVER=dev` to test against the Vite dev server instead.

- **chromium** (desktop): navigation, missions (rewards, replay, hints, keyboard-only), bosses, daily
  challenge across two days (with a controlled clock), challenge modes (keyboard shortcuts, Blitz clock,
  relaxed timing), achievements, profile import, offline leaderboard, **accessibility** (axe WCAG 2.1 A/AA,
  one test per page × theme, plus interactive states), skip link & focus, Kid mode free hint, notifications
  never hiding result content (at every text size).
- **mobile** (Pixel 5, touch): no sideways scrolling on any page; compact header and challenge question above
  the fold at every text size; a whole mission played by tapping.
- **online** (fake Supabase at the HTTP level, real supabase-js): join/name taken, automatic score
  submission with the answer log, ranking, offline queue and retry, delete my data; cloud save with **two
  browser contexts sharing one account** (progress and Quanta merge); email linking and sign-in links;
  accessibility of the online screens in Kid mode.

Useful options: `./scripts/e2e-sandbox.sh --project mobile`, `--grep "boss"`, `--headed`,
`--repeat-each=3` (flakiness check). Failure traces and screenshots go to `test-results/`
(`npx playwright show-trace …`).

## 3. Robustness checks (`npm run test:stress`)

Tests that pass on one machine can fail on another. `scripts/stress-tests.sh` reruns the suites under
conditions that differ between machines and prints which tests fail under which condition
(logs in `$STRESS_DIR`, default `/tmp/physics-companion-stress`):

| Check | Condition |
|---|---|
| `unit-slow` | Slow/busy machine: one CPU shared with two busy loops |
| `unit-tz` | UTC, Los Angeles, Kolkata (+5:30), Lord Howe (+10:30/+11), Kiritimati (+14), Pago Pago (−11) |
| `unit-locale` | German, Arabic and Japanese system locales |
| `unit-order` | Random test order with fixed seeds (replayable) |
| `unit-time` | "Now" pinned (`TEST_NOW`) to 23:59:58 local, EU/US DST switches, new year's eve, leap day, week start |
| `e2e-load` | 4 parallel workers; 2 workers under CPU load |
| `e2e-tz` | Browser in Kiritimati (+14) and Los Angeles |

```bash
npm run test:stress                              # all unit checks (~20 min)
npm run test:stress -- unit-slow e2e-load        # selected checks
npm run test:stress -- all                       # unit + e2e checks (~45 min)
TEST_NOW=2026-11-07T23:59:58 TZ=Pacific/Kiritimati npm run test   # reproduce one condition
```

Issues these checks found and that are fixed:
- **Timeouts on slower machines:** long UI tests were close to Vitest's 5 s default and scenario browser
  tests close to Playwright's 30 s default (up to ~33 s under load). Unit tests now have 20 s, browser tests
  60 s / 10 s per assertion, and browser tests run against production bundles (page loads were the main
  cost and varied 3× between runs on the dev server). The slowest browser test now takes ~15 s under load.
- **Font-dependent layout assertions:** "notifications never cover the result" compared box positions and
  failed with slightly larger fonts. Both layout tests now check the real requirement (no text/control
  hidden; header ≤ 25% of the screen) at every text size.
- **Port collisions / reusing a foreign server:** test servers use free ports and never attach to an
  existing server (which could be a developer's dev server with real Supabase keys).
- **Accessibility audit as one long test:** split into one test per page and theme.

## 4. Manual QA walkthrough

Start with `npm run dev`. To jump to later content, import a save from `docs/qa-saves/` on the Profile page:

| File | Use it to test |
|---|---|
| `1-beginner-boss-ready.json` | The first boss (6 of 10 Beginner missions done) |
| `2-all-worlds-unlocked.json` | All worlds, all four bosses available, higher daily/challenge tiers |
| `3-veteran-everything-done.json` | Achievements (many unlock on import), full Collection and Codex |

Use *Profile → Reset* to start over. The browser devtools can fake the date (Sensors) for streak tests.

**Learning loop**
- [ ] Play a Beginner mission: intro → practice → quiz, one question at a time, feedback with explanation.
- [ ] Use hints: tiers appear one by one, the button shows the cost; the result shows "Hints used".
- [ ] A perfect quiz gives 3★ and the full reward with toasts; Retry gives new numbers and a 20% reward;
      a failed quiz gives no reward and explains why.
- [ ] Numeric answers accept "4 m/s", "1,5" and "4,900".

**Bosses** (save 1)
- [ ] World page shows the boss card; the battle shows stage, HP bar, hearts and taunts.
- [ ] Winning unlocks the next world and adds Codex entries; Retreat counts as a loss.

**Daily & streaks**
- [ ] Home shows the Daily card; complete it → reward breakdown, countdown, 🔥 1 in the top bar.
- [ ] Replaying today is practice only. The next day (change the system date) the streak is "at risk"
      until you play, then +20% bonus.

**Achievements & collection** (save 3)
- [ ] Import shows a summary toast; Achievements page: categories, filters, progress bars, secrets hidden.
- [ ] Collection shows named badges; Codex shows counts and "Not yet discovered" for missing entries.

**Challenge mode**
- [ ] Blitz ends after 60 s; Sprint per-question timer auto-fails at 0; Survival loses lives and ends at 0.
- [ ] Keys 1–4 answer; the results review lists every answer with explanations; personal bests per timing.
- [ ] Relaxed and Untimed change the rules text and timers.

**Online** (needs a Supabase project — see `supabase/README.md`)
- [ ] Leaderboard: join (try a taken name), play a Sprint at a normal pace → your row appears.
- [ ] Turn off the network, play another run → "waiting to upload"; reconnect → uploaded.
- [ ] Kid mode: only generated nicknames; linking an email asks a grown-up first.
- [ ] Cloud save on two browsers: enable on both (sign in with the linked email on the second) → progress
      and Quanta combine. *Delete my online data* removes name, scores and cloud save.

**Accessibility & devices**
- [ ] Keyboard only: Tab → "Skip to main content"; play a quiz with arrows/Enter; challenge with 1–4.
- [ ] Themes: dark, light, high contrast; Settings → Text size Large; Reduced motion.
- [ ] A screen reader (NVDA/VoiceOver) announces feedback, toasts and "10 seconds left".
- [ ] Phone width: header is compact, no sideways scrolling, quiz options are easy to tap.
