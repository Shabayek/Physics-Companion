# Roadmap — Engagement & Online Features

Approved plan. Each phase ends with typecheck + lint + unit/integration tests + build green,
one git commit, and an explicit go-ahead before the next phase starts.

## Decisions (approved)

| Topic | Decision |
|---|---|
| Backend | Real online backend: **Supabase** (Postgres + RLS + RPC, anonymous auth) |
| World unlock | Beating the world boss unlocks the next world (already-unlocked worlds stay open) |
| Economy | Full Quanta on first clear (≥1★), 20% on replays, nothing for 0★ |
| Hints | Cost points on that question; Kid mode gets the first hint free |
| Streak activity | Any completed activity (mission, boss, daily, challenge) |
| Content | Replace placeholder quiz questions in all 31 missions with real ones |
| Timers | "Relaxed timing" option (×1.5 / untimed); relaxed runs tagged separately |
| Cloud save | Included (Phase 7) |

## Phases

| # | Phase | Status |
|---|---|---|
| 0 | Foundation & fixes | ✅ Done |
| 1 | Question bank, shared QuizRunner, tiered hints | ✅ Done |
| 2 | Boss challenges (one per world) | ✅ Done |
| 3 | Achievements & badges engine | ✅ Done |
| 4 | Daily challenge & streaks | ✅ Done |
| 5 | Challenge mode with timer (Blitz / Sprint / Survival) | ✅ Done |
| 6 | Online leaderboard (Supabase) | ✅ Done |
| 7 | Cloud save sync (Supabase) | ✅ Done |
| 8 | Polish: a11y, E2E, code-splitting, docs | ✅ Done |

### Phase 0 — Foundation & fixes ✅
- Dependency versions fixed (7 pinned versions did not exist); lockfile regenerated.
- Scoring: stars from accuracy (3★ reachable), real quiz time, speed bonus only for correct answers.
- Economy: rewards only on first clear (≥1★), 20% replay reward.
- Save format v2 (`stats`, `streak`, `daily`, `bosses`, `achievements`, `challenge`) with automatic v1
  upgrade, lenient repair of stored data, strict validation of imports (zod/mini).
- Pure game-event reducer (`applyEvent`), injectable clock, seeded RNG, local-date utilities.
- Toast notifications, main navigation, reduced-motion setting applied, backend config detection.

### Phase 1 — Questions, QuizRunner, hints ✅
- Seeded question generators built on `physics.ts` (answers computed by the engine) + hand-written
  conceptual questions, tagged by world/topic/difficulty. Pure and DOM-free (shared with the server).
- One `QuizRunner` (one question at a time, feedback, explanations) reused by every quiz surface.
- Tiered hints (nudge → formula → worked first step), each reduces that question's points.
- Runs record a compact answer log (seed, answers, per-answer timing) for server validation.

Delivered: 29 seeded generators (answers computed by `physics.ts`, 300 seeds × 29 generators verified
to accept their own displayed answer), 96 hand-written concept questions replacing every placeholder,
`buildMissionQuiz` (new numbers each attempt) and `buildQuestionSet` (for bosses/daily/challenge),
`QuizRunner`, tiered hints (−25% credit each; stars use hint-adjusted credit; Kid mode: first hint free),
engine re-grading of submitted answers, E2E sandbox runner (`npm run test:e2e:sandbox`).

### Phase 2 — Bosses ✅
- Inertia Golem, Circuit Hydra, Orbital Leviathan, Quantum Sphinx: HP bar, 3 hearts, 3 escalating stages.
- Unlock at 60% of the world's missions; defeating the boss unlocks the next world.
- Rewards: boss badge, large Quanta reward, Codex law/constant cards. Replays rated by hearts/time.

Delivered: 90 HP over 3 stages (stage follows HP), 10 damage per correct answer (8/5/3 with paid hints),
3 hearts; deterministic per-stage question pools (no repeats) sized for the worst case; battles replayable
from (boss, seed, answers) with re-grading (`replayBossBattle`); retreat = lost attempt; first victory pays
100/200/300/500 Quanta, badge and Codex cards (all 30 laws + 19 constants across the 4 bosses), rematch
wins pay 20%; best hearts/time tracked; missions no longer unlock worlds — the boss does.

### Phase 3 — Achievements & badges ✅
- Data-driven definitions (condition, progress target, tier, reward, secret flag), ~25–30 total.
- Evaluated by the event reducer (toasts on unlock); retroactive for existing players.
- Achievements page with progress bars; badge showcase in Collection.

Delivered: 29 achievements (missions, mastery, knowledge, bosses; 2 secret), each granting Quanta and a badge;
evaluated after every event and retroactively on load/import (single summary toast); >2 simultaneous
unlocks are summarised so important notices (e.g. "New world unlocked") are not crowded out; badge
registry (64 badges) with named showcase; new stats: hint-free quizzes, hint-free and clutch boss wins.
Phase 4 adds streak/daily ("dedication") achievements, Phase 5 challenge-mode ones.

### Phase 4 — Daily challenge & streaks ✅
- 5 questions/day seeded by local date from unlocked worlds; rewarded once, replayable for practice.
- Bonus: base + 10%/streak day (cap +100%), perfect bonus, day-7 chest.
- Streak: current/longest on local calendar days, robust to clock changes; badges at 3/7/14/30/100.

Delivered: daily set depends only on (date, tier) — tier = highest unlocked world, questions from all
worlds up to it — so players at the same tier share the same questions (daily leaderboard in Phase 6);
rewarded once per date (yesterday's run accepted after midnight), replays are practice; base × accuracy
+ streak bonus + perfect bonus + 100-Quanta chest every 7th streak day; streak updated centrally in
`applyEvent` for any event with ≥1 correct answer (clock moved backwards = no change); 9 dedication
achievements; streak chip (at-risk state) in the top bar, Daily card with countdown on Home, /daily page;
toast queue (3 visible) so notices never cover results.

### Phase 5 — Challenge mode ✅
- Blitz (60 s), Sprint (10 questions, per-question timer), Survival (3 lives, rising difficulty).
- Combo multiplier, timestamp-based timer, hints cost time, Relaxed timing option.

Delivered: Blitz (60 s total), Sprint (10 × 20 s), Survival (3 lives; harder and faster every 5 answers);
points = (10 × difficulty + speed bonus) × combo (×1.0–×2.0); paid hints cost 5 s (untimed: 25% of the
points); Standard / Relaxed (×1.5) / Untimed timing saved in settings, personal bests per mode+timing;
pure run engine replayable from (mode, timing, tier, seed, answers) — wall time ≥ sum of answer times so
UI-accepted runs always replay identically; fast UI (buttons, keys 1–4, ✓/✗ flash, review with
explanations at the end), screen-reader timer announcements at 10 s and 5 s; 5 challenge achievements.

### Phase 6 — Online leaderboard (Supabase) ✅
- Anonymous sign-in + display name (length/profanity filter, unique); Kid mode: generated nicknames only.
- Boards: each challenge mode, daily (same seed for everyone), fastest boss clears; all-time + weekly; own rank.
- Writes only via a server function (RPC) with plausibility checks: per-mode score caps, minimum time per
  question, one daily submission per day, rate limits, answer log consistent with score. RLS: read-only.
- Offline-first: queued submissions; falls back to a local board if not configured.
- Opt-out of public boards; "delete my online data".
- SQL tested against local PostgreSQL 16; client adapter unit-tested.
- Owner steps: create Supabase project, enable anonymous sign-ins, run migration, set `.env.local`.

Delivered: migration with RLS + validated SECURITY DEFINER RPCs (`upsert_profile`, `submit_score`,
`get_leaderboard`, `get_my_rank`, `delete_my_data`), 8 SQL test groups on a throwaway PostgreSQL
(`npm run test:db`); client: lazy-loaded supabase-js, anonymous sign-in on first write, local fallback
board, persisted offline queue with backoff, cached profile for offline play, client-side mirror of the
server rules (contract-tested against the SQL), Leaderboard page (join/edit/private/delete, challenge,
daily and boss boards, all-time/weekly, your rank); E2E against an HTTP-level fake Supabase.
See `supabase/README.md` for setup.

### Phase 7 — Cloud save sync (Supabase) ✅
- `saves` table (one row per user: progress JSON, revision, updated_at), owner-only RLS, push via RPC with
  optimistic concurrency (`expected_revision`), size guard. Pulled saves validated by the v2 schema.
- Pure, unit-tested `mergeProgress(local, remote)`: monotonic fields merge (best stars/scores, unions of
  collections/achievements/badges, bosses defeated, stats max, daily history union, streak by latest activity);
  Quanta tracked with per-device counters so earnings on two devices add up instead of overwriting.
- Cross-device: anonymous accounts live in one browser, so syncing to a second device requires linking an
  email (magic link). In Kid mode linking sits behind a parent gate.
- Sync on launch, after gameplay events (debounced) and on tab focus; offline queue; status indicator;
  "delete cloud save".

Delivered (design refinement: a **three-way merge** against the last synced version replaces per-device
counters — counters merge as local + remote − base, so earnings on two devices add up, spending would be
handled too, and no save-format change is needed): `cloud_saves` table + `get/put/delete_cloud_save` RPCs
(optimistic concurrency, 256 KB limit, write throttle), SQL tests; pure `mergeProgress` (counters add,
bests kept, unions, preferences by change, joined cross-device streaks) with symmetry/idempotence tests;
`CloudSync` engine (upload / download / merge / conflict retry, never overwrites progress made during a
sync, account switches reset the base, remote data repaired by the schema); opt-in Profile panel with
status, sync now, email linking and magic-link sign-in (parental gate in Kid mode), delete; top-bar
indicator; E2E with two browser contexts sharing one account.

### Phase 8 — Polish ✅
- Playwright E2E for every flow (needs a machine that can download Playwright browsers), a11y pass
  (keyboard, ARIA live regions for timers/toasts, reduced motion, text size setting), per-route
  code-splitting, README/ARCHITECTURE update.

Delivered: axe WCAG 2.1 A/AA audits (14 pages × 3 themes + interactive states + online Kid-mode screens)
and the fixes they drove (theme colour tokens, real high-contrast theme, readable locked items, underlined
in-text links, valid toast region, primary-button contrast); skip link, focus + title on navigation, text
size setting applied, toasts pause on hover/focus and show 2 at a time; compact mobile header; per-route
code-splitting; mobile (Pixel 5) E2E project, keyboard/Kid-mode/toast-overlap E2E; QA save files;
`npm run verify` / `verify:all`; rewritten README and `docs/TESTING.md`. Lab simulations are unchanged
(separate task).
