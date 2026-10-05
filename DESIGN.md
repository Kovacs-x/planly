# Planly design system

This file records how Planly's UI looks, as refined with Impeccable. It covers the existing look; it doesn't start a redesign. Product facts live in `PRODUCT.md`. The rules are enforced in `v2/index.html` by the final style blocks `planlyDockedNav` and `planlyRefineA`–`D`, and checked by `scripts/validate-planly-js.mjs`.

## Mode
**Operate.** Planly is a daily app used to get things done. Familiarity and consistency matter more than novelty, and colour is used sparingly.

## Colour
- **Section colours** are part of Planly's identity. Each section has a solid colour and a soft tint, both defined for light and dark mode.

  | Section | Colour | Tint |
  |---|---|---|
  | Today | `--today` (blue) | `--todayTint` |
  | Plan | `--plan` (violet) | `--planTint` |
  | Home | `--home` (green) | `--homeTint` |
  | Budget | `--budget` (amber) | `--budgetTint` |

- **Current section:** `--sec` and `--secTint` hold the colours of the active tab, set from the bottom bar's active button. Use them rather than hard-coding a section colour.
- **Where section colour goes:**
  - primary actions;
  - selected states;
  - the active tab;
  - list counts;
  - quiet actions.

  Don't use section colour as decoration anywhere else.
- **Meaning colours are separate and always allowed where they carry meaning:**
  - danger and overdue (red);
  - paid, to pay and unplanned in Budget;
  - person colours on chips, avatars and "Done by" (you, partner, anyone);
  - calendar source colours.
- **Not allowed:** gradients on controls, coloured glows, radial halos, and coloured side stripes on cards.

## Shape
| Element | Corner radius |
|---|---|
| Controls (buttons, segments, inputs) | 12px (`--rControl`) |
| Surfaces (grouped lists, summary, cards) | 16px (`--rSurface`) |
| Chips | 999px |
| Sheets | rounded top corners only |

## Surfaces
- **Sections** (Home, Budget, the Today summary) are borderless 16px surfaces.
- **Lists:** consecutive task rows share one surface with hairline dividers. Rows inside a section (chores, lists, projects, categories) are flat, with dividers. Don't give each task its own card, and never put a card inside a card.
- **Overlays** (sheets, dialogs) get their elevation from a soft shadow only, with no hairline border on top.
- **The bottom tab bar** is docked flush to the screen edge, opaque, safe-area aware, with a single hairline above it.

## Buttons
There are three kinds, plus one selected state.

| Kind | Look | Used for |
|---|---|---|
| **Primary** | Solid `--sec`, text `--bg`, 12px, weight 600 | One per view: Plan my day, Save task, + Payment |
| **Secondary** | Transparent, 1px `--line` outline, text `--text`, weight 600 | Timeline, + Income, Quick fill, chips |
| **Quiet** | Text only, in `--sec`, weight 600 | + Add chore, + New list, Why?, Hide today, the Budget month arrows |
| **Selected** | `--secTint` background, `--sec` text | Segments, date chips, Just me / Household |

Text on primary buttons must have a contrast of at least 4.5:1 in both themes. This is tested.

## People
- Show the name a person has chosen.
- If they haven't chosen one, show "You" for yourself and "Partner" for the other member.
- Person colours tell you and your partner apart, but always together with the name, never colour alone.

## Header
- The sync status, search and profile controls are the same size (40px) and have no fill.
- Sync status is shown as a dot and a word.

## Type
- One family: Outfit, self-hosted.
- Headings 700; buttons, labels and task titles 600; body 400.
- No decorative labels above headings: the heading speaks for itself. Labels that carry information (calendar source names, settings groups) are fine.

## Motion
- 150–250ms, used to show a change of state.
- Respect `prefers-reduced-motion`.
