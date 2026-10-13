# Integrated Household Release Gate

This gate separates **deployed** from **production accepted**. CI/source markers are not evidence that a user-facing control is reachable on a real installed PWA.

## Automated release invariants

The main regression workflow must pass final generated-JS parsing, security invariants, Budget release/acceptance checks, Shared Lists and Household Dashboard gates, and `scripts/validate-integrated-release.mjs`.

The integrated gate requires the production runtime manifest, network-first runtime-module discovery with offline fallback, deterministic Budget composition, optimistic `cloud_version` writes, Household-only dashboard queries, and the private external-calendar boundary.

## Live database audit

Before a Household release, inspect live `pg_policies` and RLS state rather than relying only on migration files. All Planly data tables must retain RLS. Personal access remains owner-only; Household access is an explicit additional path. Browser-supplied ownership is never authority.

Security-advisor warnings for intentional authenticated SECURITY DEFINER RPCs must be reviewed function-by-function. An RPC is acceptable only when its body authenticates the caller and re-authorizes the requested object/action. Helper functions not intended as public RPCs should not retain unnecessary authenticated EXECUTE permission.

Calendar source credentials remain private and have no direct client table policy. Access is only through owner-authorized credential RPCs. External calendar sources are never automatically Household-visible.

## Three-identity matrix

Use three identities for final acceptance:

1. Household owner.
2. Current Household member.
3. Unrelated account / clean new-household account.

Verify successful and denied operations. Do not use service-role credentials for these client-equivalent tests.

### Budget

Owner and member must each be able to use the shared Household Budget through the application. Verify category creation/editing, monthly target creation/editing, income/payment creation, and permitted entry editing/deletion. Verify persisted results from the other Household account after refresh/reload.

Entries remain creator-owned for mutation; another member must not be able to silently take ownership of or mutate an entry where policy says owner-only. Personal Budget scopes/categories/targets/entries must not be readable or writable by the other Household member or unrelated account.

### Tasks, projects and Lists

Verify Household-visible records are visible to both members and private records remain owner-only. Assignment completion must only allow the current assignee through the authorized RPC path. Lists must preserve list ownership while allowing the documented Household collaboration path. Test denied ownership spoofing and unrelated-account access.

### Calendar

Verify private external sources and events remain private. In particular, a private ICS rota/source on the primary account must not appear to the Household member merely because both users share a Household.

## PWA/lifecycle matrix

On the installed iPhone/PWA and normal Safari, verify first-open and navigation/re-entry for Today, Budget, Lists and Household Dashboard. Budget must render its complete Personal composition on first entry and after Personal → Household → Personal. Test a deployment upgrade while an older service worker controls the client, then confirm newly deployed runtime modules become reachable without requiring an app kill/reopen. Verify offline launch/recovery and fixed bottom navigation/safe-area behavior.

## Production acceptance

A release may be called **deployed** after the exact `main` commit's GitHub Pages build/deployment succeeds. User-facing lifecycle behavior is only **production accepted** after the applicable real-device checks above pass. Keep manual checks minimal and targeted to behavior that CI cannot genuinely reproduce.

## Gate record — 13 Oct 2026 (main `8e6dc34`, migrations through 055)

**Live database audit** (read-only queries; the identity matrix ran inside a block that raised at the end, so nothing was saved):
- All 24 tables in `public` and `planly_private` have RLS enabled. `anon` can read none of them.
- Policies: personal data (tasks, projects, preferences, sync state, food, calendar sources and events, profiles) is owner-only. Household data (shared tasks and projects, Lists, Budget scopes) is visible to members only. The five private tables with no policies (Google tokens, push outbox/sent/subscriptions, calendar credentials) are reachable only through owner- or service-role functions.
- List and list-item identity (owner, household, visibility) is immutable via `planly_protect_list_identity`, so a member can't take over a shared list.
- Every SECURITY DEFINER function has a pinned `search_path`, and none is executable by `anon` or `PUBLIC`. The 13 that `authenticated` can call (the advisor's WARN list) were each read: every one authenticates `auth.uid()` and re-authorizes the object (owner, member, or current assignee).
- Advisor items left as they are: "RLS enabled, no policy" on the five private tables (intended), and leaked-password protection disabled (an Auth dashboard setting).

**Identity matrix** (as `authenticated` with each user's JWT claims):

| Check | Owner | Member | Unrelated |
|---|---|---|---|
| Owner's private tasks visible | 32 | 0 | 0 |
| Owner's household tasks visible | 7 | 7 | 0 |
| Others' food, preferences, external calendar events | 0 | 0 | 0 |
| Household members / household Budget scope visible | 2 / 1 | 2 / 1 | 0 / 0 |
| Direct update of the owner's private or household task | — | 0 rows | 0 rows |
| Complete the owner's shared chore via RPC | — | allowed | refused (Not authorized) |
| Complete the owner's private task via RPC | — | refused | refused |

**Offline:** `tests/browser/household-offline.test.mjs` (18 checks, in CI). The partner's offline ticks and completions survive a restart and replay through the household RPCs, and the last tick keeps its auto-complete. There are no direct writes to the owner's rows: the detector inspects both the URL filters and the submitted records, and a built-in self-check sends deliberate direct writes that each carry exactly one ownership signal (only `owner_id` in a POST body; only the owner's row id in a POST body; only the row in a PATCH filter), plus two unrelated writes, and requires exactly the three to be caught. With the auto-complete flag removed from the queue, 3 checks fail. Removing any one of the detector's three matches fails that probe's own check.

**Regression:** 12 validators; food-search 38/38; browser fitness-food 55, fitness-scan 21, fitness-search-proxy 10, household-offline 18, projects-tabs 20, sync-conflicts 27, undated-repeats 9, update-banner 11; smoke check 27 screens, 0 page errors.

**Still manual (real devices):** the PWA/lifecycle matrix above.
