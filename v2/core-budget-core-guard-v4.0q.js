// Planly 4.0Q — retire legacy optimistic mutators that can stage stale baseVersion=0 updates.
(()=>{'use strict';
const api=window.PlanlyBudget;if(!api)return;
function actions(){const a=window.PlanlyBudgetActions;if(!a)throw Error('Budget persistence layer is unavailable.');return a}
// Existing-row mutations must use the authoritative guarded-update path. Creates remain offline-first in core.
api.updateEntry=(id,patch)=>actions().persistedEntryUpdate(id,patch);
api.deleteEntry=id=>actions().persistedDelete(id);
api.updateCategory=(id,patch)=>actions().persistedCategoryUpdate(id,patch);
api.__legacyMutationGuard='authoritative-v1';
})();
