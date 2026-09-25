import fs from 'node:fs';

const app=fs.readFileSync('v2/app-v3.2.0.js','utf8');
const hardening=fs.readFileSync('v2/hardening-v3.3b.js','utf8');
const projects=fs.readFileSync('v2/core-projects-v3.3c.js','utf8');
const build=fs.readFileSync('v2/core-build-v3.3c.js','utf8');
const assignment=fs.readFileSync('v2/core-assignment-v3.3c.js','utf8');
const projectPlanning=fs.readFileSync('v2/core-project-planning-v3.3c.js','utf8');
const householdCalendar=fs.readFileSync('v2/core-household-calendar-v3.3c.js','utf8');
const householdPlanningSafety=fs.readFileSync('v2/core-household-planning-safety-v3.3c.js','utf8');
const closeout=fs.readFileSync('v2/core-closeout-v3.3c.js','utf8');
const cloudReadiness=fs.readFileSync('v2/core-cloud-readiness-v3.3d.js','utf8');
const releaseGate=fs.readFileSync('v2/core-release-gate-v3.3d.js','utf8');
const sw=fs.readFileSync('v2/sw.js','utf8');
const closeIndex=app.lastIndexOf('})();');
if(closeIndex<0)throw new Error('Planly core injection point missing');
const generated=app.slice(0,closeIndex)+'\n'+projects+'\n'+build+'\n'+assignment+'\n'+projectPlanning+'\n'+householdCalendar+'\n'+householdPlanningSafety+'\n'+closeout+'\n'+cloudReadiness+'\n'+releaseGate+'\n'+app.slice(closeIndex)+'\n;'+hardening;
new Function(generated);
new Function(sw);
const fail=(m)=>{throw new Error(m)};
if(generated.includes('$$$'))fail('Found $$$ regression');
const bad=(generated.match(/(^|[^$])\$\([^)]*\)\.forEach/g)||[]).filter(m=>!m.includes('$$('));
if(bad.length)fail('Found accidental $().forEach: '+bad.slice(0,3).join(' | '));
for(const needle of ["$$('.nav button').forEach","$$('#quickDates .chip').forEach","$$('[data-planly-calendar-refresh]').forEach","$$('[data-planly-calendar-remove]').forEach","$$('[data-planly-calendar-toggle]').forEach","$$('[data-planly-calendar-colour]').forEach"]){if(!generated.includes(needle))fail('Missing collection handler: '+needle)}
for(const needle of ['function todayView','function upcomingView','function inboxView','function settingsView','function openSheet','function completeTaskWithUndo','function reconcilePlanlyCloud','function projectCloudRow','function planlyProjectFromCloudRow','function planlyProjectForTask','function planlyProjectStatsFor','PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING=false','function planlyMonthTasksForDate','function planlyMonthExternalForDate','Private calendar · read only','Shared means explicitly household-visible Planly tasks','commitPlanDay=function()','function planly33dReleaseGateAudit','function planlyCloudWriteStatusPersisted']){if(!generated.includes(needle))fail('Missing critical function: '+needle)}
for(const needle of ["const CACHE='planly-v2-330d06'","const VERSION='planly-v2-sw-330d06'","core-projects-v3.3c.js?v=330c02","core-build-v3.3c.js?v=330d06","core-assignment-v3.3c.js?v=330d06","core-project-planning-v3.3c.js?v=330c04","core-household-calendar-v3.3c.js?v=330c05","core-household-planning-safety-v3.3c.js?v=330c05","core-closeout-v3.3c.js?v=330c06","core-cloud-readiness-v3.3d.js?v=330d03","core-release-gate-v3.3d.js?v=330d01","await self.clients.claim()"]){if(!sw.includes(needle))fail('Missing build/transition marker: '+needle)}
if(sw.includes('client.navigate(client.url)'))fail('Unsafe activation-time client navigation present');
for(const needle of ["caches.open('planly-v2-330d06')","app-v3.2.0.js?v=330c02","core-build-v3.3c.js?v=330d06","core-assignment-v3.3c.js?v=330d06","core-project-planning-v3.3c.js?v=330c04","core-household-calendar-v3.3c.js?v=330c05","core-household-planning-safety-v3.3c.js?v=330c05","core-closeout-v3.3c.js?v=330c06","core-cloud-readiness-v3.3d.js?v=330d03","core-release-gate-v3.3d.js?v=330d01","text==='planly-v2-sw-330d06'"]){if(!build.includes(needle))fail('Offline marker mismatch: '+needle)}
if(!assignment.includes("select('initial_migration_completed_at')"))fail('Authenticated cloud readiness check missing');
if(!assignment.includes('planlyCloudReadOnly=false'))fail('Authenticated writable bootstrap missing');
if(!householdCalendar.includes("filter==='shared'"))fail('Shared Month filter missing');
if(!householdCalendar.includes("filter==='all'||filter==='wife'?externalEventsForDate"))fail('External calendar privacy filter missing');
if(!householdPlanningSafety.includes('incomingByKey'))fail('Plan My Day incoming-task preservation missing');
if(!closeout.includes('matches.length===1?matches[0]:null'))fail('Ambiguous project identity guard missing');
if(!closeout.includes('if(scopedOwner)return state.projects.find'))fail('Scoped project owner guard missing');
for(const needle of ["'cloud-write-test'","'offline-retry-needed'","'conflict'",'cloudWritePersisted','serverCloudReady','serverCloudReady||cloudWritePersisted','planlyCloudReadOnly=!ownCloudReady']){if(!cloudReadiness.includes(needle))fail('Cloud readiness authority guard missing: '+needle)}
for(const needle of ['PLANLY_CLOUD_CACHE_PREFIX','PLANLY_CLOUD_PENDING_PREFIX','PLANLY_CLOUD_CONFLICT_PREFIX','resetPlanlyCloudRuntimeState','t._planlyOwnedByMe===false',".eq('cloud_version',version)",'stableBase','blocked.has(key)','PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING']){if(!releaseGate.includes(needle))fail('3.3D release gate missing: '+needle)}
console.log('Planly generated JS regression checks passed.');
