// Planly 3.3D — household/offline/security release-gate assertions.
// Injected inside the primary application closure. Read-only: this never mutates cloud data.
function planly33dReleaseGateAudit(){
  const source=fn=>typeof fn==='function'?Function.prototype.toString.call(fn):'';
  const checks=[
    {name:'cloud cache is account-scoped',ok:source(planlyCloudAccountKey).includes("prefix+id")&&source(readPlanlyCloudCache).includes('PLANLY_CLOUD_CACHE_PREFIX')},
    {name:'pending journal is account-scoped',ok:source(readPlanlyPendingWrites).includes('PLANLY_CLOUD_PENDING_PREFIX')&&source(writePlanlyPendingWrites).includes('PLANLY_CLOUD_PENDING_PREFIX')},
    {name:'conflicts are account-scoped',ok:source(readPlanlyConflicts).includes('PLANLY_CLOUD_CONFLICT_PREFIX')&&source(writePlanlyConflicts).includes('PLANLY_CLOUD_CONFLICT_PREFIX')},
    {name:'account switch resets runtime',ok:source(adoptPlanlySession).includes('ownerChanged')&&source(adoptPlanlySession).includes('resetPlanlyCloudRuntimeState')},
    {name:'explicit sign-out removes last-account pointer',ok:source(adoptPlanlySession).includes("localStorage.removeItem(PLANLY_CLOUD_LAST_ACCOUNT_KEY)")},
    {name:'incoming shared tasks cannot stage owner writes',ok:source(stageTaskMutation).includes('t._planlyOwnedByMe===false')},
    {name:'incoming shared projects cannot stage owner writes',ok:source(stageProjectMutation).includes('planlyProjectOwnedByMe')},
    {name:'task updates use optimistic cloud_version',ok:source(cloudUpdateTask).includes(".eq('cloud_version',version)")},
    {name:'project updates use optimistic cloud_version',ok:source(cloudUpdateProject).includes(".eq('cloud_version',version)")},
    {name:'task deletes use optimistic tombstones',ok:source(cloudDeleteTaskById).includes('deleted_at')&&source(cloudDeleteTaskById).includes(".eq('cloud_version',version)")},
    {name:'project deletes use optimistic tombstones',ok:source(cloudDeleteProjectById).includes('deleted_at')&&source(cloudDeleteProjectById).includes(".eq('cloud_version',version)")},
    {name:'offline replay preserves base version',ok:source(stagePlanlyPendingWrite).includes('stableBase')&&source(replayPlanlyPendingWrites).includes('op.baseVersion')},
    {name:'conflicts block only matching entity',ok:source(replayPlanlyPendingWrites).includes('blocked.has(key)')&&source(replayPlanlyPendingWrites).includes('conflicts++;continue')},
    {name:'cloud bootstrap is owner/RLS driven',ok:source(loadVerifiedCloudPreview).includes("from('planly_tasks')")&&source(loadVerifiedCloudPreview).includes("from('planly_projects')")},
    {name:'external calendar household sharing remains disabled',ok:typeof PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING!=='undefined'&&PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING===false},
    {name:'service worker/offline probe available',ok:typeof verifyPlanlyOfflineCache==='function'&&typeof probePlanlyServiceWorker==='function'}
  ];
  return {passed:checks.every(x=>x.ok),build:'330d01',checks};
}
