# Planly Budget mutation regression gate

- Payment edits await journal replay before navigation/rerender.
- Payment deletion awaits journal replay and surfaces pending/conflict failures.
- Category rename/removal awaits journal replay and surfaces pending/conflict failures.
- Set Budget/category-target UI is removed from the monthly workflow.
- Existing target rows may remain in storage for backwards compatibility, but are not exposed or used by the active Budget UI.
- Personal/Household scope isolation and creator ownership rules are unchanged.
- Budget page-transition scroll-to-top layer remains unchanged.
