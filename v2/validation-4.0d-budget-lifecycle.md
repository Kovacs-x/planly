# Planly 4.0D Budget lifecycle validation

Automated gates cover the final generated JavaScript composition, service-worker/cache markers, preserved navigation/calendar handlers, budget scope isolation, owner-only budget entry mutation guards, optimistic `cloud_version` writes, and absence of privileged Supabase credentials.

Lifecycle acceptance paths:

- Personal and Household scope controls remain delegated through the existing 4.0C renderer.
- Expense entries expose Planned/Paid state changes and edit controls.
- Income entries can be opened for editing from the income section.
- Entry edit supports amount, category, recurring flag, and expense due day/status.
- Entry delete uses the existing owner-only runtime mutation path.
- Household members cannot update/delete another member's entry because `updateEntry`/`deleteEntry` reject rows whose `owner_id` differs from the authenticated owner, with RLS remaining the server authority.
- Offline writes continue through the scope-specific pending journal and optimistic `cloud_version` reconciliation.
