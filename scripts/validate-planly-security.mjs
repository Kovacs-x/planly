import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=m=>{throw new Error(m)};
const migrationDir=path.join(root,'supabase/migrations');
const migrations=fs.readdirSync(migrationDir).filter(f=>f.endsWith('.sql')).sort().map(f=>`\n-- ${f}\n${read(`supabase/migrations/${f}`)}`).join('\n');
const clientFiles=['v2/supabase-config.js','v2/app-v3.2.0.js','v2/hardening-v3.3b.js','v2/core-assignment-v3.3c.js','v2/core-projects-v3.3c.js','v2/core-household-calendar-v3.3c.js','v2/core-release-gate-v3.3d.js'].filter(f=>fs.existsSync(path.join(root,f)));
const client=clientFiles.map(read).join('\n');

// Browser code must never contain privileged Supabase credentials.
for(const needle of ['service_role','SUPABASE_SERVICE_ROLE','sb_secret_']){
  if(client.toLowerCase().includes(needle.toLowerCase())) fail(`Privileged Supabase credential marker in browser code: ${needle}`);
}

// Core cloud tables must remain RLS-protected in migration history.
for(const table of ['planly_tasks','planly_projects','planly_preferences','planly_sync_state','calendar_sources','external_calendar_events','calendar_source_credentials','planly_households','planly_household_members','planly_household_invites']){
  const re=new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`, 'i');
  if(!re.test(migrations)) fail(`Missing RLS enablement for ${table}`);
}

// Credential storage is server-only: no authenticated/anon direct grants.
if(/grant\s+[^;]+\s+on\s+(?:table\s+)?(?:public\.)?calendar_source_credentials\s+to\s+(?:anon|authenticated)/i.test(migrations)){
  fail('Direct client grant detected on calendar_source_credentials');
}

// Household sharing must not turn external calendar sources into shared household data.
for(const table of ['calendar_sources','external_calendar_events']){
  const suspicious=new RegExp(`create\\s+policy[\\s\\S]{0,600}on\\s+(?:public\\.)?${table}[\\s\\S]{0,900}(household_id|planly_is_household_member)`, 'i');
  if(suspicious.test(migrations)) fail(`Household visibility leaked into private calendar table ${table}`);
}

// Optimistic concurrency must remain part of browser writes.
if(!client.includes(".eq('cloud_version',version)")) fail('Optimistic cloud_version write guard missing');
if(!client.includes('PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING')) fail('External-calendar household privacy guard missing');

console.log('Planly security regression checks passed.');
