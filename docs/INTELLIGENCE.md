# Planly Intelligence 5.0

Planly Intelligence is a deterministic advisory layer between Planly's structured state and planning UI.

## First milestone

The first milestone improves **Plan My Day** without an external AI/API dependency. The engine consumes an explicit snapshot of tasks, projects, planning hours, household assignment metadata and calendar busy intervals. It returns ranked priorities, proposed Top 3 choices, optional times and plain-English reasons.

The engine is data-source agnostic: it does not fetch, query Supabase or write state. The UI owns data collection and applies recommendations only to the existing Plan My Day draft. Nothing is persisted until the user explicitly chooses **Start my day**.

## Privacy and household boundaries

- Private external calendar records remain private. The engine receives busy intervals, not source credentials or calendar titles.
- Household tasks owned by another member are excluded from mutation recommendations, even when assigned to the current user.
- Existing RLS and `cloud_version` concurrency remain authoritative; Intelligence does not create a parallel write path.
- No service-role credentials or privileged authorization logic belong in the engine.

## Determinism

Given the same structured input, including an explicit current-minute value, the engine returns the same recommendation output. Ordering uses explicit scoring followed by stable tie-breaks. Recommendation reasons are generated from the factors that affected ranking or scheduling.

External AI may be added later as an optional layer, but it must not replace these authorization, confirmation or deterministic planning foundations.
