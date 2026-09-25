# Planly 3.3C project planning validation

- Shared project statistics are scoped by `(owner_id, client_id)`, not `client_id` alone.
- Project pills carry the task owner and open the matching household project.
- Incoming household tasks remain visible in planning surfaces but timeline drag/reschedule is denied locally.
- Creator-owned tasks retain existing planning behaviour.
- Assignment completion remains on the existing authoritative `planly_set_assigned_task_completed` RPC path.
- External calendar sources are not copied into household project state and no household calendar-source sharing path is introduced.
- Service-worker cache/version markers advance together to `330c04`.
- Existing `$$()` navigation, Quick Dates and Calendar Source handlers are untouched because the primary app bundle is not rewritten by this change.
- New injected JavaScript contains no `$$$` token and no `$().forEach` pattern.
