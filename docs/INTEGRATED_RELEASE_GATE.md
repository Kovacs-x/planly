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
