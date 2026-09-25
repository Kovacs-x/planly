# Planly security model

Planly uses deny-by-default authorization. A user's private data is owner-only. Household access is a separate, explicit authorization path and must never weaken owner authorization globally.

## Required invariants

1. All application tables exposed through Supabase Data API have RLS enabled.
2. Browser-supplied ownership is never trusted as authorization.
3. `service_role`/secret credentials never enter browser code.
4. Owner updates retain both `USING` and `WITH CHECK` authorization semantics.
5. Shared tasks/projects require explicit household visibility plus valid household membership.
6. Private tasks/projects remain owner-only.
7. External calendar sources and imported events remain owner-private. In particular, a private NHS/ICS source must not become household-visible merely because its owner belongs to a household.
8. Calendar credentials have no direct `anon` or `authenticated` table access; privileged operations remain server controlled.
9. Cloud writes use optimistic concurrency through `cloud_version`; timestamp last-write-wins is not an acceptable replacement.
10. Security-definer RPCs must perform explicit authenticated-user and ownership/membership checks and must not trust caller-provided ownership.

## Validation

CI runs both `scripts/validate-planly-js.mjs` and `scripts/validate-planly-security.mjs`. Database changes must additionally be checked with Supabase security/performance advisors and must test denied operations as well as successful ones.
