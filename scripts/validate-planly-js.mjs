import fs from 'node:fs';

const app=fs.readFileSync('v2/app-v3.2.0.js','utf8');
const hardening=fs.readFileSync('v2/hardening-v3.3b.js','utf8');
const projects=fs.readFileSync('v2/core-projects-v3.3c.js','utf8');
const build=fs.readFileSync('v2/core-build-v3.3c.js','utf8');
const assignment=fs.readFileSync('v2/core-assignment-v3.3c.js','utf8');
const sw=fs.readFileSync('v2/sw.js','utf8');
const closeIndex=app.lastIndexOf('})();');
if(closeIndex<0)throw new Error('Planly core injection point missing');
const generated=app.slice(0,closeIndex)+'\n'+projects+'\n'+build+'\n'+assignment+'\n'+app.slice(closeIndex)+'\n;'+hardening;
new Function(generated);
const fail=(m)=>{throw new Error(m)};
if(generated.includes('$$$'))fail('Found $$$ regression');
const bad=(generated.match(/(^|[^$])\$\([^)]*\)\.forEach/g)||[]).filter(m=>!m.includes('$$('));
if(bad.length)fail('Found accidental $().forEach: '+bad.slice(0,3).join(' | '));
for(const needle of ["$$('.nav button').forEach","$$('#quickDates .chip').forEach","$$('[data-planly-calendar-refresh]').forEach","$$('[data-planly-calendar-remove]').forEach","$$('[data-planly-calendar-toggle]').forEach","$$('[data-planly-calendar-colour]').forEach"]){if(!generated.includes(needle))fail('Missing collection handler: '+needle)}
for(const needle of ['function todayView','function upcomingView','function monthView','function inboxView','function settingsView','function openSheet','function completeTaskWithUndo','function reconcilePlanlyCloud','function projectCloudRow','function planlyProjectFromCloudRow','function planlyProjectForTask']){if(!generated.includes(needle))fail('Missing critical function: '+needle)}
for(const needle of ["const CACHE='planly-v2-330c02'","const VERSION='planly-v2-sw-330c02'","core-projects-v3.3c.js?v=330c02","core-build-v3.3c.js?v=330c02","core-assignment-v3.3c.js?v=330c02"]){if(!sw.includes(needle))fail('Missing build marker: '+needle)}
for(const needle of ["caches.open('planly-v2-330c02')","app-v3.2.0.js?v=330c02","text==='planly-v2-sw-330c02'"]){if(!build.includes(needle))fail('Offline marker mismatch: '+needle)}
console.log('Planly generated JS regression checks passed.');
