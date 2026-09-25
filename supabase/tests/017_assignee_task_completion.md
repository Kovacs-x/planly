# Planly 3.3B — assignee completion phone test

1. Account A creates a Household task and assigns it to Account B.
2. Account B should see `Assigned to you`; the completion circle is enabled, while edit/delete remain unavailable.
3. On Account B, tap the completion circle. The task should become completed and leave the active section according to normal Planly completed-task presentation.
4. Account A should receive the completion change through the existing Household realtime/reconciliation path without manually enabling Cloud Sync.
5. Reopen the completed section on Account B and tap the completion circle again. The task should return to active and Account A should update.
6. Reassign the task to Account A. Account B must return to view-only and must no longer be able to toggle completion.
7. Change the task back to Private. Account B must lose visibility after reconciliation.

Security invariant: assignment grants only completion/reopen authority through `planly_set_assigned_task_completed`. Creator-only edit, delete, schedule, project, sharing and assignment authority remains unchanged.
