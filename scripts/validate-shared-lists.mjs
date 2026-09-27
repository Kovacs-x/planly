import fs from 'node:fs';
const fail=m=>{console.error('FAIL:',m);process.exit(1)};
const lists=fs.readFileSync('v2/core-lists-v4.1.js','utf8'),sw=fs.readFileSync('v2/sw.js','utf8'),migrations=fs.readdirSync('supabase/migrations').filter(x=>x.endsWith('.sql')).map(x=>fs.readFileSync('supabase/migrations/'+x,'utf8')).join('\n');
for(const x of ['planly-lists-cache-v1:','planly-lists-pending-v1:',".eq('cloud_version',op.baseVersion)",'window.PlanlyLists','visibility===\'household\'','planly_household_members','data-item-toggle','data-lists-create'])if(!lists.includes(x))fail('Lists runtime invariant missing: '+x);
for(const x of ['planly_lists','planly_list_items','planly_lists_scope_ck','planly_lists_delete_owner','planly_list_items_update_authorized','planly_private.is_household_member','List identity and sharing scope are immutable','List item identity is immutable'])if(!migrations.includes(x))fail('Lists security invariant missing: '+x);
for(const x of ["const LISTS_RUNTIME_URL='./core-lists-v4.1.js?v=410a01'",'LISTS_RUNTIME_URL','APPEND_URLS.push('])if(!sw.includes(x))fail('Lists runtime composition missing: '+x);
if(/MutationObserver/.test(lists))fail('Lists must not use a MutationObserver renderer workaround');
if(/service[_-]?role/i.test(lists))fail('Browser Lists runtime must not contain service-role credentials');
console.log('Planly Shared Lists 4.1 release checks passed.');
