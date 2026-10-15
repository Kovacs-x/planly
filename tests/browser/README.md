# Browser regression tests

End-to-end tests that drive the real app (`v2/`) in a phone-sized Chromium. Supabase is replaced by an
in-memory mock inside `harness.mjs`, so the tests never touch the real Planly database or any account.

## Run locally

```sh
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tests/browser/projects-tabs.test.mjs
```

Each test prints one `PASS`/`FAIL` line per check and ends with `N passed, M failed`; it exits non-zero on any failure.

Optional settings:

- `PLANLY_ROOT=/path/to/other/checkout` serves a different copy of the app, for example the base branch, to compare.
- `PLANLY_CHROMIUM=/path/to/chromium` uses an existing Chromium instead of Playwright's.
- `PLANLY_SUPABASE_UMD=/path/to/supabase.js` serves a local copy of the pinned supabase-js bundle, for machines that
  cannot reach cdn.jsdelivr.net.

The tests use port 8765, so run one at a time.

## Tests

| File | What it checks |
|---|---|
| `projects-tabs.test.mjs` | Bottom tabs always leave Projects (#250). Typed work is saved, or the editor stays open when it has no name or saving is refused. Untouched or unchanged editors just close. A Household choice counts as typed work. |
| `undated-repeats.test.mjs` | A repeating task with no date (a weekly chore) comes back on its next repeat day when ticked. This covers your own chores (made by the app) and the other person's (the next date sent to the server, migration 052). Dated repeats are unchanged. |
| `fitness-food.test.mjs` | The Fitness tab (5.1): five tabs on one row; targets worked out and saved; Open Food Facts search (answered locally), adding, favourites, quick add, edit, delete; offline changes sent when back online; a change made on another device is not overwritten; only this person's food is read or written, and only the search words go to Open Food Facts. Typing in Search keeps the same box (no redraw, which made the page jump on iPhone); the fast search service is tried first, the classic one is the fallback with one retry when busy, and when both are down the message says so instead of blaming the connection. Suggestions while typing: your own foods match word starts instantly ("gre y"), one round of Open Food Facts requests after a pause (not per letter); the test's search service matches whole words only, like the real one, so a half-typed last word is asked as a word start ("apple jui*") and as the finished words ("apple"), and "apple jui" still finds Apple Juice when word starts aren't understood, a whole word still works if word starts are refused, and typed symbols are not sent. When a search or suggestion fails, the reason (could not connect, refused with a code, took too long) is shown in small print, best match first with no duplicates; an answer that doesn't match every typed word is never shown alongside real matches, and when nothing matches the answers are labelled "close matches"; repeats answered from memory, a slow earlier answer never replaces a newer one, and back keeps the words and suggestions. The base branch has no Fitness tab, so this test is not compared against it. |
| `fitness-scan.test.mjs` | The barcode scanner (stage 3): Chromium's fake camera shows a real EAN-13 barcode drawn by the test, so the bundled ZXing decoder runs end to end. The product opens and is saved with its barcode; the camera is switched off when a code is found or the scanner closes; only the barcode number goes to Open Food Facts (answered locally); mistyped codes are caught; unknown codes offer Quick add or search; favourites work offline; a barcode typed into Search works; a refused camera explains how to allow it. UPC-E: a typed short code is checked as UPC-E and looked up as its UPC-A number, and a stand-in for Android's built-in reader reporting a UPC-E is handled end to end (ZXing's UPC-E reader is broken in 0.23.0, so it is off on iPhone). Barcode images come from `barcodes.mjs` (EAN-13, EAN-8, UPC-A, UPC-E). |
| `fitness-search-proxy.test.mjs` | Food search through Planly's `food-search` Edge Function, end to end: the real function code runs in the test (fake Supabase Auth, fake Open Food Facts with whole-word matching) and the phone itself cannot read Open Food Facts, as on iPhone. Suggestions ("apple ju" → Apple Juice), Search with UK products first, adding a result, and a typed barcode all work through the function; the app sends only the mode and search words with its own sign-in; when Open Food Facts is down the small print names the reason from the function and from the direct try. |
| `update-banner.test.mjs` | The "Planly update ready" banner (a fake waiting service worker stands in for a real update): it shows no explanation line; tapping Update while a sheet is open shows "Finish or close what you are editing, then update." with no page error and does not update, tapping again keeps one warning; after the sheet is closed, Update sends SKIP_WAITING and the warning is cleared. |
| `sync-conflicts.test.mjs` | Sync conflicts: four tasks are changed on the phone while offline and also changed in the cloud. A new time here plus a checklist tick there are combined; the same change on both sides needs no choice; deleted on both sides needs nothing; a title changed both ways is not overwritten and the sync label reads "1 to review"; tapping the label opens the choice, and keeping this phone's version syncs it and the label returns to "Synced". A checklist tick made on the phone while the cloud copy is being read for a combine is kept with both earlier changes, and a task whose cloud row is missing (not marked deleted) stays and waits for a choice. A preference changed while another preference write is in flight reaches the cloud, both in a normal sync and during an automatic merge (with the merged changes kept). A change made while a combined task is being written, to a field the cloud also changed, does not overwrite the cloud and waits for a choice; a project changed in different fields on both sides is combined. |
| `household-offline.test.mjs` | Release gate: on the partner's phone, checklist ticks and completions of the owner's shared chores made offline wait in the queue, survive a restart (the last tick keeps its auto-complete), and replay through the household RPCs when back online. The partner's phone never writes the owner's task rows directly. |
| `budget-tab.test.mjs` | The composed Budget screen: Me and Household (header and figures), the month bar, a category's bills, adding, paying and deleting a payment, the scroll position put back when a redraw moves the page (the test makes it move), leaving and returning, the Household set-up card, and the six drawing steps registered in order (tidy-up 2b-ii). |
| `render-steps.test.mjs` | The view's render steps (tidy-up 2b-ii part B): Today, Plan and its segments, Home, Budget and Fitness each draw through their step; two renders in the same turn draw the view once (stable step), renders in separate turns each draw; `?planlydiag=1` logs renders and is off otherwise. |
| `budget-delete.test.mjs` | Budget totals after deleting, in Me and Household: deleting a category deletes all of its payments in the cloud (any month, paid or not, including the partner's in Household), each only at the version first seen (a payment edited meanwhile on another device is left alone), with each payment left behind reported under its own reason (changed on another device, not synced yet, could not be removed — a request error or a delete that matched no row at an unchanged version; one already deleted elsewhere is not reported) and the total, Today and carry forward stop counting them; Manage › Remove does the same; a category deleted before this fix no longer counts; deleting or changing a payment changes the total; no Carry forward button when everything to carry is £0. |
| `task-sharing.test.mjs` | The task sheet's Share (Just me / Household) and Assign (Anyone / a member by name): saving shares and assigns the task, editing shows its person, duplicate resets Assign, Just me hides it; while Planly Cloud Sync is not ready Household is refused and a shared save is stopped; the partner sees the owner's chore read-only with its person; coming back to the app signals a foreground resume once. Written before tidy-up 2c. |

CI: `.github/workflows/browser-tests.yml` runs these on every pull request that touches `v2/` or `tests/browser/`.
On a pull request it also runs them against the base branch for comparison; that run is informational, not a gate.
