# Planly test harness (test tooling only; never merged into main)

Headless iPhone-sized Chromium + a strict in-memory Supabase mock, used to test the
**composed runtime** (the service worker composes `app-v3.2.0.js` + core modules +
`runtime-modules.json` modules, so later modules override base functions).

## Setup (claude.ai/code container)
- Playwright: `/opt/node22/lib/node_modules/playwright/index.mjs` (imported by `harness.mjs`)
- Chromium: `/opt/pw-browsers/chromium`. Do not run `playwright install`.

```bash
cd tools/test-harness
rm -rf tree && mkdir tree && cp -r ../../v2 ../../scripts tree/     # the code under test
# optional: a production copy for comparisons
# rm -rf main-tree && mkdir main-tree && (cd ../.. && git archive origin/main v2 scripts) | tar -x -C main-tree
node serve.mjs &            # port 8802 (PORT=8803 for a second server; then sed the port in test copies)
node t96.mjs pr             # baseline: launch 24 / resume 5 / idle 0
```
Recopy `tree/` after every code change. Background servers in the container stop after ~2 h; restart them.

## Files
- `serve.mjs`: static server for `tree/` (or `main-tree/` via `/__switch?to=main`), serving `/planly/v2/...`.
- `harness.mjs`: `launch({uid, device})` → `{page, W (wait ms), MOCK, ctx, errors, browser}`. Routes Supabase REST / auth / RPC to the mock and serves `supabase.umd.js` locally.
- `mock.mjs`: seeded data:
  - users: owner `ME` (alex@example.test) and `PARTNER`, with household `HH`
  - tasks: weekly chores, household "Book flights", overdue items
  - projects with due dates
  - a calendar source with shift events
  - budget rows
  
  It emulates RLS-ish visibility, `cloud_version` and the production `planly_stamp_task_completion_actor` trigger.
- `fuzz.cjs`: Intelligence engine fuzz, run as `node fuzz.cjs ../../v2/core-intelligence-v5.js` (5,000 cases).

## Tests (most print JSON lines, then `PASS`/`FAIL`; always also check `errors []`)
| Test | Covers |
|---|---|
| t96 `pr` | request baseline: **launch 24, resume 5, idle 0** |
| hdr | header one row, profile / search 44×44 |
| t100 `pr` | layout sweep 320 / 390 / 430 × light / dark (pre-existing: Month day cells 37–38 px) |
| t105 `pr` | Budget (the `pr partner` variant fails on production too: fixture limit) |
| t112 owner / partner | names (via the Settings hub), bills |
| t113 | bills across devices |
| t118 | Share / Assign |
| t119 owner / partner | chores, density |
| t120c | Top 3 drag |
| t121 | partner read-only |
| t127 | Plan My Day commit (`CLOCK=`) |
| t129 | Tidy up |
| t130 | Why? |
| t134 | Plan my week Undo |
| t135 / t136 | Plan a block |
| t137 owner / partner | chore balance |
| t140b | focus learning |
| t143 | UK time / DST (`CLOCK=2026-10-25T00:30:00Z TZID=Europe/London`) |
| t144 / t145 / t146 | offline + big data, two phones, **both phones complete the same chore** |
| t147 / t148 | four tabs, Profile → Settings, Settings sweep |
| t149 | Stage 4 Part 2 surfaces |
| t150 `work` / `ordinary` | Top 3 limit 2 / 3 on every surface |
| t151 | the user's "Mustafa WFH" row: nothing clipped; Hide today → Show |
| t152 | four equal tabs, Why? alignment, Show on Today toggles |
| t153 | Settings hub + 7 pages, profile initial, tab icons |
| t154 owner / partner | person colours (relative) + contrast |
