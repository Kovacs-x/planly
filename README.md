# Planly

Planly is a personal and household productivity PWA. It combines tasks, projects, planning, recurring work, external calendar context and household collaboration while retaining explicit ownership boundaries.

## Production

The production application is served from `v2/` on GitHub Pages. `main` is the production branch.

## Architecture

- Browser/PWA runtime: `v2/`
- Supabase schema and authorization migrations: `supabase/migrations/`
- Edge functions: `supabase/functions/`
- Generated-JS regression gate: `scripts/validate-planly-js.mjs`
- Security invariant gate: `scripts/validate-planly-security.mjs`

See `docs/ARCHITECTURE.md` and `docs/SECURITY.md` before changing sync, household authorization, calendar handling, or ownership semantics.

## Development gates

Every JavaScript change must pass the final generated bundle validator. Security-sensitive changes must preserve owner-only private data, make household access an explicit additional path, keep external calendar sources private unless explicitly shared, and use `cloud_version` optimistic concurrency rather than timestamp last-write-wins.

Migration numbering is historical and intentionally retains the existing gap at `021`; applied migrations must not be renumbered merely for cosmetic continuity.
