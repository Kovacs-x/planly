// Planly 3.3D — persist explicit Cloud Sync enablement for fresh cloud-native accounts.
// Injected inside the primary application closure. Legacy migration remains deny-by-default.
function planlyCloudWriteStatusPersisted(status=planlyCloudLocalStatus()){
  return ['cloud-write-test','offline-retry-needed','conflict'].includes(String(status?.state||''));
}
loadVerifiedCloudPreview=async function(){
  if(!PLANLY_CLOUD_PREVIEW||!planlySession?.user||!initPlanlySupabase()){planlyCloudBootstrapPending=false;return false;}
  const ownerId=planlySession.user.id;
  const previousStatus=planlyCloudLocalStatus();
  const {data:sync,error:syncError}=await planlySupabase.from('planly_sync_state').select('initial_migration_completed_at,migration_project_count,migration_task_count,migration_digest').eq('owner_id',ownerId).maybeSingle();
  if(syncError)throw syncError;
  // A legacy account is ready only after verified migration. A fresh cloud-native account
  // becomes ready only after this exact account explicitly enabled writes on this device.
  const cloudWritePersisted=planlyCloudWriteStatusPersisted(previousStatus);
  const ownCloudReady=!!sync?.initial_migration_completed_at||cloudWritePersisted;
  const tasksPromise=planlySupabase.from('planly_tasks').select('owner_id,client_id,data,visibility,household_id,cloud_version,deleted_at').is('deleted_at',null);
  const projectsPromise=ownCloudReady?planlySupabase.from('planly_projects').select('client_id,data,cloud_version,deleted_at').eq('owner_id',ownerId).is('deleted_at',null):Promise.resolve({data:[],error:null});
  const prefsPromise=ownCloudReady?planlySupabase.from('planly_preferences').select('default_category,default_duration,auto_complete_parent_subtasks,planning_start,planning_end,cloud_version').eq('owner_id',ownerId).maybeSingle():Promise.resolve({data:null,error:null});
  const [tasksRes,projectsRes,prefsRes]=await Promise.all([tasksPromise,projectsPromise,prefsPromise]);
  for(const r of [tasksRes,projectsRes,prefsRes])if(r.error)throw r.error;
  const visibleTaskRows=tasksRes.data||[];
  const taskRows=ownCloudReady?visibleTaskRows:visibleTaskRows.filter(r=>String(r.owner_id||'')!==String(ownerId)&&r.visibility==='household');
  const projectRows=projectsRes.data||[];
  const tasks=taskRows.map(r=>{if(!r.data||String(r.data.id)!==String(r.client_id))throw new Error('Cloud bootstrap stopped: task identity mismatch.');return planlyTaskFromCloudRow(r)});
  const projects=projectRows.map(r=>{if(!r.data||String(r.data.id)!==String(r.client_id))throw new Error('Cloud bootstrap stopped: project identity mismatch.');return r.data});
  assertUniqueLocalIds(tasks,'Cloud tasks');assertUniqueLocalIds(projects,'Cloud projects');rememberCloudVersions(taskRows,projectRows,prefsRes.data||null);
  state.tasks=tasks;state.projects=projects;
  const p=prefsRes.data;if(p){state.defaultCategory=p.default_category||'Personal';state.defaultDuration=Number(p.default_duration||30);state.autoCompleteParentSubtasks=!!p.auto_complete_parent_subtasks;state.planningStart=p.planning_start||'08:00';state.planningEnd=p.planning_end||'23:00'}
  const pendingBeforeOverlay=readPlanlyPendingWrites();
  planlyCloudReadOnly=ownCloudReady?(pendingBeforeOverlay.length?false:!cloudWritePersisted):true;
  planlyCloudBootstrapPending=false;
  if(ownCloudReady)applyPlanlyPendingToState();
  persistPlanlyCloudCache();planlyLastReconcileAt=Date.now();
  if(ownCloudReady)setPlanlyCloudLocalStatus({state:planlyCloudReadOnly?'cloud-loaded':'cloud-write-test',taskCount:tasks.filter(t=>t._planlyOwnedByMe!==false).length,projectCount:projects.length,loadedAt:new Date().toISOString(),pendingWrites:readPlanlyPendingWrites().length});
  else setPlanlyCloudLocalStatus({...previousStatus,householdLoadedAt:new Date().toISOString(),householdTaskCount:tasks.length});
  if(ownCloudReady&&!planlyCloudReadOnly&&readPlanlyPendingWrites().length)queueCloudWrite(()=>replayPlanlyPendingWrites(),'Offline changes synced');
  return true;
};
