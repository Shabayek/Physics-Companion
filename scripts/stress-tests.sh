#!/usr/bin/env bash
# Repeatable robustness checks. Runs the test suites under conditions that differ between machines
# and reports exactly which tests fail under which condition:
#
#   unit-slow    slow/busy machine: tests pinned to one CPU shared with busy loops
#   unit-tz      time zones far from UTC, incl. half-hour and ±12 h+ zones
#   unit-locale  non-English system locales
#   unit-order   random test order (fixed seeds, so failures can be replayed)
#   unit-time    "now" pinned to date edges: local midnight, DST switches, year end, leap day, week start
#   e2e-load     browser tests with more parallel workers under CPU load
#   e2e-tz       browser tests with the browser in other time zones
#
# Usage:  ./scripts/stress-tests.sh [check ...]        (default: all unit checks)
#         ./scripts/stress-tests.sh all                (unit + e2e checks; takes a while)
#         npm run test:stress -- unit-slow unit-time
# Logs:   $STRESS_DIR (default ${TMPDIR:-/tmp}/physics-companion-stress) — one JSON/log per run.
# Exit code is non-zero if any run failed; a summary table is printed at the end.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${STRESS_DIR:-${TMPDIR:-/tmp}/physics-companion-stress}"
mkdir -p "$OUT"
cd "$ROOT_DIR"

SUMMARY="$OUT/summary.txt"
: >"$SUMMARY"
failures=0
hogs=()

log() { printf '\033[1;36m[stress]\033[0m %s\n' "$*" >&2; }

start_load() { # $1 = number of busy loops, pinned to CPU 0 when taskset exists
  local n="$1"
  for _ in $(seq 1 "$n"); do
    if command -v taskset >/dev/null 2>&1; then taskset -c 0 sh -c 'while :; do :; done' & else sh -c 'while :; do :; done' & fi
    hogs+=($!)
  done
}
stop_load() {
  for pid in "${hogs[@]:-}"; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null; done
  hogs=()
}
trap stop_load EXIT

# Prints the failing test names of a Vitest JSON report (or the error if the run itself broke).
vitest_failures() {
  node -e '
    const fs = require("fs");
    let r; try { r = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { console.log("  (no report: run crashed — see log)"); process.exit(0); }
    for (const f of r.testResults) {
      for (const t of f.assertionResults) if (t.status === "failed")
        console.log("  ✘ " + f.name.replace(/.*\/tests\//, "tests/") + " › " + t.fullName + "\n      " + (t.failureMessages[0] || "").split("\n")[0].slice(0, 160));
      if (f.status === "failed" && f.assertionResults.length === 0) console.log("  ✘ " + f.name + ": " + (f.message || "").split("\n")[0]);
    }' "$1"
}

# run_unit <label> [ENV=VALUE ...] -- [extra vitest args]
run_unit() {
  local label="$1"; shift
  local envs=() args=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do envs+=("$1"); shift; done
  [[ "${1:-}" == "--" ]] && shift
  args=("$@")
  local slug; slug="$(echo "$label" | tr -c 'A-Za-z0-9' '_')"
  local report="$OUT/$slug.json"
  rm -f "$report"
  log "unit · $label"
  local prefix=()
  [[ -n "${PIN_CPU:-}" ]] && command -v taskset >/dev/null 2>&1 && prefix=(taskset -c 0)
  env "${envs[@]}" "${prefix[@]}" npx vitest run --reporter=dot --reporter=json --outputFile="$report" "${args[@]}" >"$OUT/$slug.log" 2>&1
  local code=$?
  if [[ $code -eq 0 ]]; then
    echo "PASS  unit  $label" | tee -a "$SUMMARY" >&2
  else
    failures=$((failures + 1))
    { echo "FAIL  unit  $label"; vitest_failures "$report"; } | tee -a "$SUMMARY" >&2
  fi
}

# run_e2e <label> [ENV=VALUE ...] -- [playwright args]
run_e2e() {
  local label="$1"; shift
  local envs=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do envs+=("$1"); shift; done
  [[ "${1:-}" == "--" ]] && shift
  local slug; slug="$(echo "$label" | tr -c 'A-Za-z0-9' '_')"
  log "e2e · $label"
  env "${envs[@]}" PLAYWRIGHT_JSON_OUTPUT_NAME="$OUT/$slug.json" ./scripts/e2e-sandbox.sh --reporter=list,json "$@" >"$OUT/$slug.log" 2>&1
  local code=$?
  if [[ $code -eq 0 ]]; then
    echo "PASS  e2e   $label" | tee -a "$SUMMARY" >&2
  else
    failures=$((failures + 1))
    { echo "FAIL  e2e   $label"; grep -E "^\s+✘" "$OUT/$slug.log" | sed 's/^ */  /' | sort -u; } | tee -a "$SUMMARY" >&2
  fi
  rm -rf test-results playwright-report
}

check_unit_slow() {
  start_load 2
  PIN_CPU=1 run_unit "slow machine (1 CPU shared with 2 busy loops)"
  stop_load
}

check_unit_tz() {
  for tz in UTC America/Los_Angeles Asia/Kolkata Australia/Lord_Howe Pacific/Kiritimati Pacific/Pago_Pago; do
    run_unit "TZ=$tz" "TZ=$tz"
  done
}

check_unit_locale() {
  for loc in de_DE.UTF-8 ar_EG.UTF-8 ja_JP.UTF-8; do
    run_unit "locale $loc" "LANG=$loc" "LC_ALL=$loc"
  done
}

check_unit_order() {
  for seed in 1 2 3; do
    run_unit "shuffled order (seed $seed)" -- --sequence.shuffle --sequence.seed="$seed"
  done
}

check_unit_time() {
  run_unit "now = 23:59:58 local (Europe/Paris)" "TZ=Europe/Paris" "TEST_NOW=2026-11-07T23:59:58"
  run_unit "now = 23:59:58 local (Pacific/Kiritimati, UTC+14)" "TZ=Pacific/Kiritimati" "TEST_NOW=2026-11-07T23:59:58"
  run_unit "now = EU DST switch (Europe/Berlin)" "TZ=Europe/Berlin" "TEST_NOW=2026-03-29T01:59:58Z"
  run_unit "now = US DST end (America/New_York)" "TZ=America/New_York" "TEST_NOW=2026-11-01T05:59:58Z"
  run_unit "now = new year's eve 23:59:59" "TZ=UTC" "TEST_NOW=2026-12-31T23:59:59Z"
  run_unit "now = leap day 2028-02-29" "TZ=UTC" "TEST_NOW=2028-02-29T12:00:00Z"
  run_unit "now = Monday 00:00:01 UTC (week start)" "TZ=UTC" "TEST_NOW=2026-11-09T00:00:01Z"
}

check_e2e_load() {
  run_e2e "4 workers, desktop+mobile" -- --workers=4 --project=chromium --project=mobile
  start_load 2
  run_e2e "2 workers under CPU load" -- --workers=2 --project=chromium --project=mobile
  stop_load
}

check_e2e_tz() {
  for tz in Pacific/Kiritimati America/Los_Angeles; do
    run_e2e "browser TZ=$tz" "TZ=$tz" -- --project=chromium --project=mobile
  done
}

checks=("$@")
[[ ${#checks[@]} -eq 0 ]] && checks=(unit-slow unit-tz unit-locale unit-order unit-time)
[[ "${checks[*]}" == "all" ]] && checks=(unit-slow unit-tz unit-locale unit-order unit-time e2e-load e2e-tz)

for c in "${checks[@]}"; do
  fn="check_${c//-/_}"
  if declare -F "$fn" >/dev/null; then "$fn"; else log "unknown check: $c"; exit 2; fi
done

echo >&2
log "summary ($OUT/summary.txt)"
cat "$SUMMARY" >&2
exit $(( failures > 0 ? 1 : 0 ))
