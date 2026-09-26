import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8'),fail=m=>{throw new Error(m)},migrationDir=path.join(root,'supabase/migrations');
const migrations=fs.readdirSync(migrationDir).filter(f=>f.endsWith('.sql')).sort().map(f=>`\n-- ${f}\n${read(`supabase/migrations/${f}`)}`).join('\n');
const clientFiles=['v2/supabase-config.js','v2/app-v3.2.0.js','v2/hardening-v3.3b.js','v2/core-assignment-v3.3c.js','v2/core-projects-v3.3c.js','v2/core-household-calendar-v3.3c.js','v2/core-release-gate-v3.3d.js','v2/core-budget-v4.0b.js','v2/core-budget-ui-v4.0b.js','v2/core-budget-scope-v4.0c.js','v2/core-budget-lifecycle-v4.0d.js'].filter(f=>fs.existsSync(path.join(root,f))),client=clientFiles.map(read).join('\n');
for(const needle of ['service_role','SUPABASE_SERVICE_ROLE','sb_secret_'])if(client.toLowerCase().includes(needle.toLowerCase()))fail(`Privileged Supabase credential marker in browser code: ${needle}`);
for(const table of ['planly_tasks','planly_projects','planly_preferences','planly_sync_state','calendar_sources','external_calendar_events','calendar_source_credentials','planly_households','planly_household_members','planly_household_invites','planly_budget_scopes','planly_budget_categories','planly_budget_targets','planly_budget_entries']){const re=new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`,'i');if(!re.test(migrations))fail(`Missing RLS enablement for ${table}`)}
if(/grant\s+[^;]+\s+on\s+(?:table\s+)?(?:public\.)?calendar_source_credentials\s+to\s+(?:anon|authenticated)/i.test(migrations))fail('Direct client grant detected on calendar_source_credentials');
for(const table of ['calendar_sources','external_calendar_events']){const suspicious=new RegExp(`create\\s+policy[\\s\\S]{0,600}on\\s+(?:public\\.)?${table}[\\s\\S]{0,900}(household_id|planly_is_household_member)`,'i');if(suspicious.test(migrations))fail(`Household visibility leaked into private calendar table ${table}`)}
for(const table of ['planly_budget_scopes','planly_budget_categories','planly_budget_targets','planly_budget_entries'])if(!new RegExp(`create\\s+table\\s+(?:public\\.)?${table}[\\s\\S]{0,2500}cloud_version\\s+bigint`,'i').test(migrations))fail(`Budget table lacks cloud_version concurrency field: ${table}`);
if(!/planly_budget_entries_update_own[\s\S]{0,500}auth\.uid\(\)[\s\S]{0,500}owner_id/i.test(migrations))fail('Budget entry owner-only update policy missing');
if(!/scope_type='personal'\s+and\s+household_id\s+is\s+null/i.test(migrations))fail('Private budget scope isolation constraint missing');
if(!/scope_type='household'[\s\S]{0,500}household_id\s+is\s+not\s+null/i.test(migrations))fail('Household budget scope constraint missing');
if(!/Household already has two members/.test(migrations))fail('Two-member household server guard missing');
if(!client.includes(".eq('cloud_version',version)")&&!client.includes(".eq('cloud_version',op.baseVersion)"))fail('Optimistic cloud_version write guard missing');
if(!client.includes('PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING'))fail('External-calendar household privacy guard missing');
for(const needle of ["scope_type:'personal'","scope_type:'household'","membership.role!=='owner'","scopeKey=(p,type=activeType)",'row.owner_id!==owner'])if(!client.includes(needle))fail('Budget scope/ownership client guard missing: '+needle);
for(const needle of ['api().updateEntry','api().deleteEntry','only the person who added an entry'])if(!client.includes(needle))fail('Budget lifecycle ownership path missing: '+needle);
console.log('Planly security regression checks passed.');
