# Physics Companion

An interactive web game that teaches physics from scratch across four worlds (Beginner, Intermediate,
Advanced, Expert). Built with TypeScript, React, Vite, Tailwind CSS and Zustand; optional online features
use Supabase.

## Quick start

```bash
npm ci
npm run dev          # http://localhost:5173
```

The game runs fully offline. Online features (leaderboard, cloud save) are optional — see
[`supabase/README.md`](supabase/README.md), then copy `.env.example` to `.env.local`.

## Features

**Learning**
- 31 missions in 4 worlds, each with an intro, interactive practice and a quiz.
- A question bank of 96 hand-written concept questions and 29 seeded generators whose answers are computed
  by the physics engine — every attempt gets fresh numbers.
- Tiered hints (nudge → formula → worked first step); each paid hint costs 25% of that question's credit;
  Kid mode gets the first hint free.
- Free-play Lab with interactive simulations and a Laws & Constants Codex.

**Progression & rewards**
- **Boss battles**, one per world (HP bar, 3 hearts, 3 escalating stages). A boss appears once 60% of its
  world's missions are done; beating it unlocks the next world and fills the Codex.
- **Daily challenge**: 5 questions per day, the same for everyone at the same tier; rewards scale with
  accuracy and the streak (+10%/day up to +100%), plus a perfect bonus and a chest every 7th streak day.
- **Streaks** over local calendar days (any activity with a correct answer counts).
- **43 achievements** in 6 categories (with badges), including streak badges at 3/7/14/30/100 days;
  awarded retroactively for existing progress.
- **Challenge mode**: Blitz (60 s), Sprint (10 × 20 s), Survival (3 lives, harder and faster), combos up to
  ×2, personal bests, and Standard / Relaxed (×1.5) / Untimed timing.
- Quanta economy: full reward on a first clear, 20% on replays, nothing for 0★.

**Online (optional, Supabase)**
- **Leaderboards** for challenge modes, daily challenges (per date and tier) and fastest boss clears; all-time
  and weekly; anonymous sign-in, display names (generated nicknames in Kid mode), private mode, delete my data.
- **Cloud save** (opt-in) with automatic three-way merge between devices; link an email to continue on
  another device (parental gate in Kid mode).
- Offline-first: scores queue and upload later; without configuration a personal leaderboard is used.

**Quality**
- Accessibility: WCAG 2.1 AA checked automatically with axe on every page in dark, light and high-contrast
  themes; keyboard play, skip link, focus management, screen-reader announcements, text size setting,
  reduced motion, relaxed/untimed timers.
- Anti-cheat by design: the game engine re-grades every submitted answer; bosses, daily and challenge runs
  are replayed from their seed and answer log; the database validates leaderboard submissions.
- Saves are validated, upgraded from older versions and repaired automatically; export/import on Profile.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm run preview` | Production build / preview it |
| `npm run typecheck` / `npm run lint` | TypeScript strict check / oxlint |
| `npm run test` | Unit & integration tests (Vitest + Testing Library) |
| `npm run test:db` | Database tests on a throwaway local PostgreSQL (see `supabase/README.md`) |
| `npm run test:e2e` | Browser tests (needs `npx playwright install chromium`) |
| `npm run test:e2e:sandbox` | Browser tests with Chromium installed into a temp folder (works offline/behind proxies) |
| `npm run test:stress` | Robustness checks: the suites on a slow machine, other time zones/locales/dates, random order, parallel load |
| `npm run verify` | typecheck + lint + unit + database tests + build |
| `npm run verify:all` | `verify` + all browser tests |

See [`docs/TESTING.md`](docs/TESTING.md) for how to test the whole platform (automated and manual).

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — layers, data flow, state, online services
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — the phased plan and what each phase delivered
- [`docs/TESTING.md`](docs/TESTING.md) — test suites and a manual QA walkthrough
- [`supabase/README.md`](supabase/README.md) — backend setup and security model

## License

MIT
