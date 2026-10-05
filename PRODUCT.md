# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- Primary: a two-person household, the primary account and their partner. Each uses Planly on their own iPhone, installed to the home screen as a PWA.
- Names: show the name a person has chosen. If they haven't chosen one, show "You" for yourself and "Partner" for the other member. (Confirmed by the owner, 5 Oct 2026.)
- Later: other family members or households may join. The app must stay understandable to someone who didn't build it, but it isn't a public product. (Confirmed 4 Oct 2026.)

## Product Purpose
A household planner that keeps one shared picture of the couple's life, so neither person has to hold it in their head. It covers personal and shared tasks with checklists, recurring chores with weekly rotation, projects, shared lists, a monthly household and personal budget, and calendar context from Google and imported calendars. Success means both partners trust it as the single place to check "what's next" and "who's doing it". Things get ticked off and money gets tracked without arguments about who forgot what.

## Positioning
Built for exactly two people sharing one home: the primary account and their partner. Either partner can complete any shared chore or tick its checklist, "Done by" records who did it, chores swap weekly, and the Budget is collaborative. It works fully offline and syncs both phones without losing edits.

## Operating Context
- Quick checks on the go: what's next today, tick something off, a glance at Home.
- Evening planning: laying out the week, chores, projects and the monthly budget.
- Shared moments: both partners looking at Home or Budget together and deciding.
- Mostly iPhone, often dark mode, often one-handed, sometimes offline.

## Capabilities and Constraints
- **Stack:** vanilla JavaScript PWA. The service worker composes the runtime modules; there is no framework or build step, and it's hosted on GitHub Pages. Supabase handles auth, data, RLS and realtime.
- **Tabs:** Today, Plan, Home and Budget, plus Settings/Profile.
- **Data:** offline-first with a pending-write queue. Conflicts are detected per item version, and both phones must converge.
- **UI rules (owner's rules):** no second DOM renderer, no MutationObserver workaround, and no browser-only "clear".
- **Privacy:** the partner's NHS ICS work calendar must stay private to her.

## Brand Commitments
- The name is "Planly".
- Each section has its own colour (Today, Plan, Home, Budget) in the current app. This is an existing identity to refine, not replace. (Scope confirmed: refine what's there.)
- Partners are distinguished by person colour on chips and "Done by".

## Evidence on Hand
- Real usage data lives in the live app. Mock-ups must use realistic sample content, never real personal data.
- There are no testimonials, customers or marketing claims, and none should be invented.

## Product Principles
1. One glance tells you what's next and who's doing it.
2. Shared by default between the two of you, private where it should be.
3. Never lose a tap: offline and two-phone sync are part of the experience, not an edge case.
4. Calm over clever. It's used daily, so familiarity and consistency beat novelty.
5. Room to grow: a newcomer from the family should understand it without a tour.

## Accessibility & Inclusion
- Target WCAG 2.2 AA: text contrast, touch targets of at least 24px (44px for primary controls), keyboard reachability, and support for reduced motion.
