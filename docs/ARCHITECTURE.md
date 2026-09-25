# Planly architecture

## Runtime

`v2/index.html` is the production application shell. The current application core is `v2/app-v3.2.0.js`, extended by the 3.3 household/project/planning modules and hardening modules. `v2/sw.js` owns offline caching and must preserve the fixed-bottom-nav/iPhone-safe-area PWA architecture.

The final runtime JavaScript is treated as a generated composition. `scripts/validate-planly-js.mjs` reconstructs that composition and parses it, checks for known `$`/`$$` regressions, verifies navigation/Quick Dates/calendar-source handlers, critical functions, offline cache markers and privacy/concurrency guards.

## Cloud model

Supabase stores user-owned tasks, projects, preferences and sync state. Household tables add membership and invitation state. Household visibility is additive: membership can authorize explicitly shared Planly records but does not transform private owner data into household data.

`cloud_version` is the concurrency authority for mutable cloud records. Clients must perform conditional writes against the version they read and surface conflicts rather than silently choosing the newest timestamp.

## Calendar model

Calendar sources and imported external events are owner-private context. Calendar credentials are server-controlled and are not directly available to browser roles. Household calendar UI may show explicitly household-visible Planly tasks/projects; it must not automatically expose a user's external calendar sources.

## Deployment

`main` is production. GitHub Pages publishes the `/v2/` application. A release is only considered live after the Pages build/deployment for the exact merged `main` commit succeeds.
