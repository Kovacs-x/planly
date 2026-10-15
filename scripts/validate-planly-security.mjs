import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8'),fail=m=>{throw new Error(m)},migrationDir=path.join(root,'supabase/migrations');
const migrations=fs.readdirSync(migrationDir).filter(f=>f.endsWith('.sql')).sort().map(f=>`\n-- ${f}\n${read(`supabase/migrations/${f}`)}`).join('\n');
const clientFiles=['v2/supabase-config.js','v2/app-v3.2.0.js','v2/core-assignment-v3.3c.js','v2/core-projects-v3.3c.js','v2/core-household-calendar-v3.3c.js','v2/core-project-planning-v3.3c.js','v2/core-budget-v4.0b.js','v2/core-budget-ui-v4.0b.js','v2/core-budget-scope-v4.0c.js','v2/core-budget-lifecycle-v4.0d.js','v2/core-budget-monthly-v4.0e.js','v2/core-budget-actions-v4.0l.js'].filter(f=>fs.existsSync(path.join(root,f))),client=clientFiles.map(read).join('\n');
for(const needle of ['service_role','SUPABASE_SERVICE_ROLE','sb_secret_'])if(client.toLowerCase().includes(needle.toLowerCase()))fail(`Privileged Supabase credential marker in browser code: ${needle}`);
for(const table of ['planly_tasks','planly_projects','planly_preferences','planly_sync_state','calendar_sources','external_calendar_events','calendar_source_credentials','planly_households','planly_household_members','planly_household_invites','planly_budget_scopes','planly_budget_categories','planly_budget_targets','planly_budget_entries']){const re=new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`,'i');if(!re.test(migrations))fail(`Missing RLS enablement for ${table}`)}
if(/grant\s+[^;]+\s+on\s+(?:table\s+)?(?:public\.)?calendar_source_credentials\s+to\s+(?:anon|authenticated)/i.test(migrations))fail('Direct client grant detected on calendar_source_credentials');
for(const table of ['calendar_sources','external_calendar_events']){const suspicious=new RegExp(`create\\s+policy[\\s\\S]{0,600}on\\s+(?:public\\.)?${table}[\\s\\S]{0,900}(household_id|planly_is_household_member)`,'i');if(suspicious.test(migrations))fail(`Household visibility leaked into private calendar table ${table}`)}
for(const table of ['planly_budget_scopes','planly_budget_categories','planly_budget_targets','planly_budget_entries'])if(!new RegExp(`create\\s+table\\s+(?:public\\.)?${table}[\\s\\S]{0,2500}cloud_version\\s+bigint`,'i').test(migrations))fail(`Budget table lacks cloud_version concurrency field: ${table}`);
if(!/planly_budget_entries_update_authorized[\s\S]{0,1400}scope_type\s*=\s*'personal'[\s\S]{0,900}auth\.uid\(\)[\s\S]{0,1400}scope_type\s*=\s*'household'[\s\S]{0,900}is_household_member/i.test(migrations))fail('Collaborative Household/owner-only Personal Budget entry update policy missing');
if(!/planly_budget_entry_immutable_guard[\s\S]{0,1000}owner_id is distinct from old\.owner_id/i.test(migrations))fail('Budget entry server-side ownership immutability guard missing');
if(!/scope_type='personal'\s+and\s+household_id\s+is\s+null/i.test(migrations))fail('Private budget scope isolation constraint missing');
if(!/scope_type='household'[\s\S]{0,500}household_id\s+is\s+not\s+null/i.test(migrations))fail('Household budget scope constraint missing');
if(!/Household already has two members/.test(migrations))fail('Two-member household server guard missing');
for(const marker of ["update public.planly_budget_scopes\n     set owner_id = p_new_owner","update public.planly_budget_categories c\n     set owner_id = p_new_owner","update public.planly_budget_targets t\n     set owner_id = p_new_owner","delete from public.planly_budget_entries e","delete from public.planly_budget_scopes","Budget entry identity is immutable"])if(!migrations.includes(marker))fail('Household/Budget lifecycle security invariant missing: '+marker);
if(!client.includes('shared Household Budget')||!client.includes('Personal budgets and private Planly data'))fail('Household deletion must warn about shared Budget destruction');
for(const marker of ['planly_private_departing_member_tasks',"set visibility='private'","household_id=null","drop policy if exists planly_budget_entries_select_authorized","where s.id=scope_id"])if(!migrations.includes(marker))fail('Departing-member privacy invariant missing: '+marker);
for(const marker of ['planly_budget_shared_structure_owner','planly_private.is_household_member(s.household_id)','owner_id = public.planly_budget_shared_structure_owner(scope_id)'])if(!migrations.includes(marker))fail('Collaborative Household Budget structure authorization missing: '+marker);
if(migrations.includes('public.planly_private.is_household_member'))fail('Invalid private helper schema qualification present');
if(!client.includes(".eq('cloud_version',version)")&&!client.includes(".eq('cloud_version',op.baseVersion)"))fail('Optimistic cloud_version write guard missing');
if(!client.includes('const PLANLY_HOUSEHOLD_EXTERNAL_CALENDAR_SHARING=false;'))fail('External-calendar household privacy guard missing (must stay false)');
for(const needle of ["scope_type:'personal'","scope_type:'household'","membership.role!=='owner'","scopeKey=(p,type=activeType)"])if(!client.includes(needle))fail('Budget scope client guard missing: '+needle);
for(const needle of ["state.scope?.scope_type==='personal'?state.scope?.owner_id===owner:state.scope?.scope_type==='household'","function structureOwner(){return state.scope?.scope_type==='household'?state.scope.owner_id:owner}"])if(!client.includes(needle))fail('Collaborative Budget structure client authorization missing: '+needle);
for(const needle of ['canChangeEntry(entry)',"scope.scope_type==='household'",'classifyZero',"code:'denied'","code:'conflict'",'persistedEntryUpdate','persistedDelete'])if(!client.includes(needle))fail('Budget authoritative collaborative mutation path missing: '+needle);
for(const needle of ['x.owner_id===viewer','function recurringSources()','api().setTarget','window.PlanlyBudgetActiveMonth'])if(!client.includes(needle))fail('Monthly budget ownership/scope guard missing: '+needle);
if(/Date\.prototype\.(?:toISOString|valueOf|getTime)\s*=/.test(client))fail('Budget monthly workflow must not monkeypatch Date runtime');
// Fitness › Food (migration 054): private to each person. RLS on, owner-only policies, no household access, no anon grant.
// Each policy must match its exact expected text, so weakening USING or WITH CHECK (update has both) fails.
const foodTables=['planly_food_profile','planly_food_entries','planly_food_favourites'];
const ownerExpr='(owner_id = (select auth.uid()))';
const foodPolicy=(t,op)=>`create policy ${t}_${op}_owner on public.${t} for ${op} to authenticated `+({select:`using ${ownerExpr}`,insert:`with check ${ownerExpr}`,update:`using ${ownerExpr} with check ${ownerExpr}`,delete:`using ${ownerExpr}`})[op]+';';
// Splits SQL into statements the way PostgreSQL reads it: -- line comments and (nested) /* */ block comments become a
// space, 'strings' (incl. E'..' backslash escapes), "identifiers" and $tag$..$tag$ bodies are kept whole, and only a
// top-level ';' ends a statement. Quoted identifiers are unquoted, then whitespace and case are folded.
// Fails closed: an unterminated comment/quote, or a U& escaped name or string, is an error.
function sqlStatements(sql){
 const out=[];let cur='',i=0;const n=sql.length;
 const bad=m=>{throw new Error('SQL tokenizer: '+m)};
 while(i<n){
  const c=sql[i],d=sql[i+1];
  if(c==='-'&&d==='-'){while(i<n&&sql[i]!=='\n')i++;cur+=' ';continue;}
  if(c==='/'&&d==='*'){let depth=1;i+=2;while(i<n&&depth){if(sql[i]==='/'&&sql[i+1]==='*'){depth++;i+=2}else if(sql[i]==='*'&&sql[i+1]==='/'){depth--;i+=2}else i++}if(depth)bad('unterminated block comment');cur+=' ';continue;}
  if((c==='u'||c==='U')&&d==='&'&&(sql[i+2]==='"'||sql[i+2]==="'"))bad('U& escaped name/string not allowed');
  if(c==="'"){const esc=/[eE]/.test(sql[i-1]||'')&&!/[\w$]/.test(sql[i-2]||'');let j=i+1;for(;;){if(j>=n)bad('unterminated string');if(esc&&sql[j]==='\\'){j+=2;continue}if(sql[j]==="'"){if(sql[j+1]==="'"){j+=2;continue}break}j++}cur+=sql.slice(i,j+1);i=j+1;continue;}
  if(c==='"'){let j=i+1,name='';for(;;){if(j>=n)bad('unterminated identifier');if(sql[j]==='"'){if(sql[j+1]==='"'){name+='"';j+=2;continue}break}name+=sql[j++]}cur+=name;i=j+1;continue;}
  if(c==='$'&&!/[\w$]/.test(sql[i-1]||'')){const m=/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));if(m){const tag=m[0],end=sql.indexOf(tag,i+tag.length);if(end<0)bad('unterminated '+tag+' body');cur+=sql.slice(i,end+tag.length);i=end+tag.length;continue;}}
  if(c===';'){out.push(cur);cur='';i++;continue;}
  cur+=c;i++;}
 out.push(cur);
 return out.map(x=>x.replace(/\s+/g,' ').trim().toLowerCase()).filter(Boolean);}
// Tokenizer self-test (runs every time).
{const eq=(sql,want)=>{const got=JSON.stringify(sqlStatements(sql));if(got!==JSON.stringify(want))fail('SQL tokenizer self-test failed: '+got)};
 eq("select ';--x' as a; select 2",["select ';--x' as a","select 2"]);
 eq("create function f() returns int as $b$ select 1; $b$ language sql; select 3",["create function f() returns int as $b$ select 1; $b$ language sql","select 3"]);
 eq("select E'it\\'s; ok'; select 4",["select e'it\\'s; ok'","select 4"]);
 eq('create /* x; /* y; */ z; */ policy p on public."planly_food_entries" -- ;\n using (true); select 6',["create policy p on public.planly_food_entries using (true)","select 6"]);
 for(const bad of ["select 'x","/* open","select $q$ open",'select U&"d\\0061t"','select "x']){let ok=false;try{sqlStatements(bad)}catch{ok=true}if(!ok)fail('SQL tokenizer must refuse: '+bad)}}
const foodGuardFn="create or replace function public.planly_protect_food_identity() returns trigger language plpgsql set search_path = pg_catalog, public as $$ begin if new.owner_id is distinct from old.owner_id then raise exception 'food row owner is immutable'; end if; if tg_table_name <> 'planly_food_profile' and (new.id is distinct from old.id or new.client_id is distinct from old.client_id) then raise exception 'food row identity is immutable'; end if; return new; end $$";
const foodExpected=new Set(foodTables.flatMap(t=>['select','insert','update','delete'].map(op=>foodPolicy(t,op).slice(0,-1))));
// Closed list: every policy statement touching a food table must be one of the 12 expected ones, each exactly once.
// Anything else (no FOR clause = ALL, FOR ALL, restrictive/permissive variants, other roles, ALTER/DROP POLICY) fails.
function foodPolicyProblems(sql,requireAll){
 const out=[],seen=new Map();
 for(const st of sqlStatements(sql)){
  if(!/\bpolicy\b/.test(st)||!/planly_food_/.test(st))continue;
  if(!foodExpected.has(st)){out.push('Unexpected policy statement on a food table: '+st.slice(0,160));continue;}
  seen.set(st,(seen.get(st)||0)+1);}
 for(const st of foodExpected){const n=seen.get(st)||0;if(n>1||(requireAll&&n!==1))out.push('Owner-only policy must appear exactly once: '+st);}
 return out;}
function foodProblems(m54){
 const out=foodPolicyProblems(m54,true),stmts=sqlStatements(m54),body=stmts.join(';\n'),has=x=>stmts.includes(x);
 for(const t of foodTables){
  if(!has(`alter table public.${t} enable row level security`))out.push(`Missing RLS enablement for ${t}`);
  for(const [name,fn] of [['bump_version','public.bump_planly_cloud_version()'],['protect_identity','public.planly_protect_food_identity()']])
   if(!has(`create trigger ${t}_${name} before update on public.${t} for each row execute function ${fn}`))out.push(`Trigger ${t}_${name} missing`);}
 if(/household/.test(body))out.push('Food tables must stay private (no household access)');
 if(stmts.some(x=>/^(grant|alter default privileges)\b/.test(x)&&/\b(anon|public)\b/.test(x.split(' to ').slice(1).join(' to ')))||!has('revoke all on public.planly_food_profile, public.planly_food_entries, public.planly_food_favourites from public, anon'))out.push('Food tables must not be granted to anon/public');
 if(/disable row level security|no force row level security|bypassrls/.test(body))out.push('Food tables must not disable RLS');
 if(/security definer/.test(body))out.push('No SECURITY DEFINER code in the food migration');
 // The identity guard function must be exactly this statement (body included, so a commented-out raise fails),
 // defined once, and no other statement may create/alter/drop it.
 const fnStmts=stmts.filter(x=>/^(create (or replace )?function|alter function|drop function( if exists)?) (public\.)?planly_protect_food_identity\b/.test(x));
 if(fnStmts.length!==1||fnStmts[0]!==foodGuardFn)out.push('Food row identity guard function must be exactly the reviewed definition');
 return out;}
{const m54=read('supabase/migrations/054_fitness_food_foundation.sql');
 // The reviewed and applied migration is pinned byte for byte; later changes belong in a new migration.
 const m54sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationDir,'054_fitness_food_foundation.sql'))).digest('hex');
 if(m54sha!=='ea1ec563f1151974508578276971b4d7d678c337cd1055b700dbd3e81829a9bc')fail('Migration 054 differs from the reviewed file (sha256 '+m54sha+')');
 const problems=foodProblems(m54);if(problems.length)fail(problems[0]);
 const otherSql=fs.readdirSync(migrationDir).filter(f=>f.endsWith('.sql')&&!f.startsWith('054_')).map(f=>read(`supabase/migrations/${f}`)).join('\n;\n');
 const later=foodPolicyProblems(otherSql,false);if(later.length)fail('Other migration: '+later[0]);
 for(const st of sqlStatements(otherSql))if((/planly_food_/.test(st)||/planly_protect_food_identity/.test(st))&&(/^(create (or replace )?function|alter function|drop function( if exists)?) (public\.)?planly_protect_food_identity\b/.test(st)||/\bgrant\b/.test(st)||/disable row level security|no force row level security|security definer/.test(st)))fail('Other migration weakens food tables: '+st.slice(0,160));
 // Mutation self-test: each weakened copy of the migration must be caught.
 const upd='create policy planly_food_entries_update_owner on public.planly_food_entries for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));';
 const mutants={
  'update WITH CHECK -> true':[upd,upd.replace(/with check \(owner_id = \(select auth\.uid\(\)\)\);$/,'with check (true);')],
  'update USING -> true':[upd,upd.replace('using (owner_id = (select auth.uid()))','using (true)')],
  'update WITH CHECK removed':[upd,upd.replace(/ with check \(owner_id = \(select auth\.uid\(\)\)\);$/,';')],
  'select USING -> true':['planly_food_favourites for select to authenticated using (owner_id = (select auth.uid()));','planly_food_favourites for select to authenticated using (true);'],
  'insert WITH CHECK -> true':['planly_food_profile for insert to authenticated with check (owner_id = (select auth.uid()));','planly_food_profile for insert to authenticated with check (true);'],
  'delete USING -> true':['planly_food_profile for delete to authenticated using (owner_id = (select auth.uid()));','planly_food_profile for delete to authenticated using (true);'],
  'policy role -> public':['planly_food_entries for select to authenticated','planly_food_entries for select to public'],
  'extra permissive policy':['create policy planly_food_entries_delete_owner','create policy planly_food_entries_select_any on public.planly_food_entries for select to authenticated using (true);\ncreate policy planly_food_entries_delete_owner'],
  'anon grant':['to authenticated;\n\ncreate or replace function','to authenticated, anon;\n\ncreate or replace function'],
  'RLS off':['alter table public.planly_food_favourites enable row level security;',''],
  'extra policy with no FOR clause (defaults to ALL)':['create policy planly_food_entries_delete_owner','create policy food_entries_extra on public.planly_food_entries to authenticated using (true);\ncreate policy planly_food_entries_delete_owner'],
  'multi-line policy with no FOR clause':['create policy planly_food_entries_delete_owner','CREATE POLICY food_entries_extra\n  ON public.planly_food_entries\n  TO authenticated\n  USING (true);\ncreate policy planly_food_entries_delete_owner'],
  'explicit FOR ALL policy':['create policy planly_food_entries_delete_owner','create policy food_entries_all on public.planly_food_entries for all to authenticated using (true) with check (true);\ncreate policy planly_food_entries_delete_owner'],
  'alter policy to true':['create policy planly_food_entries_delete_owner','alter policy planly_food_entries_select_owner on public.planly_food_entries using (true);\ncreate policy planly_food_entries_delete_owner'],
  'duplicate owner policy':['create policy planly_food_entries_delete_owner','create policy planly_food_entries_select_owner on public.planly_food_entries for select to authenticated using (owner_id = (select auth.uid()));\ncreate policy planly_food_entries_delete_owner'],
  'permissive policy split by a block comment holding a semicolon':['create policy planly_food_entries_delete_owner','create policy food_x /* ; */ on public.planly_food_entries to authenticated using (true);\ncreate policy planly_food_entries_delete_owner'],
  'nested block comment around a semicolon':['create policy planly_food_entries_delete_owner','create /* a /* b; */ c; */ policy food_x on public.planly_food_entries using (true);\ncreate policy planly_food_entries_delete_owner'],
  'quoted table name':['create policy planly_food_entries_delete_owner','create policy food_x on public."planly_food_entries" to authenticated using (true);\ncreate policy planly_food_entries_delete_owner'],
  'RLS enable only inside a comment':['alter table public.planly_food_entries enable row level security;','/* alter table public.planly_food_entries enable row level security; */'],
  'grant to anon hidden behind a comment semicolon':['to authenticated;\n\ncreate or replace function','to authenticated;\ngrant select on public.planly_food_entries /*;*/ to anon;\n\ncreate or replace function'],
  'owner guard only inside a block comment':["if new.owner_id is distinct from old.owner_id then\n    raise exception 'Food row owner is immutable';\n  end if;","/* raise exception 'Food row owner is immutable'; */"],
  'owner guard only inside a string':["raise exception 'Food row owner is immutable';","perform 'raise exception ''Food row owner is immutable''';"],
  'guard function redefined later in the file':['create policy planly_food_profile_select_owner','create or replace function public.planly_protect_food_identity() returns trigger language plpgsql as $$ begin return new; end $$;\ncreate policy planly_food_profile_select_owner'],
  'guard function redefined without schema':['create policy planly_food_profile_select_owner','CREATE OR REPLACE FUNCTION "planly_protect_food_identity"() returns trigger language plpgsql as $x$ begin return new; end $x$;\ncreate policy planly_food_profile_select_owner'],
  'household policy':['using (owner_id = (select auth.uid()));\n\ncreate policy planly_food_entries_select_owner','using (owner_id = (select auth.uid()) or household_id is not null);\n\ncreate policy planly_food_entries_select_owner']};
 for(const [name,[from,to]] of Object.entries(mutants)){
  if(!m54.includes(from))fail(`Food mutation self-test anchor missing (${name})`);
  if(!foodProblems(m54.replace(from,to)).length)fail(`Food validator did not catch mutation: ${name}`);}}
// Signed-in users must not hold TRUNCATE (bypasses RLS), TRIGGER, REFERENCES or MAINTAIN. Supabase's default
// privileges add them to new tables, so migration 055 removes them and no migration may grant them (or ALL) again.
{const extraGrant=st=>/^grant\b/.test(st)&&/\b(all|truncate|trigger|references|maintain)\b/.test(st.split(' on ')[0])&&/\b(authenticated|anon|public)\b/.test(st.split(' to ').slice(1).join(' to '));
 // 055 must be exactly the one approved statement (nothing else, e.g. no DROP TABLE), and is pinned byte for byte.
 const m55Revoke='revoke truncate, trigger, references, maintain on public.planly_food_profile, public.planly_food_entries, public.planly_food_favourites, public.planly_lists, public.planly_list_items from authenticated';
 const m55Problem=sql=>{const st=sqlStatements(sql);return st.length!==1||st[0]!==m55Revoke};
 const m55src=read('supabase/migrations/055_revoke_extra_table_rights.sql');
 if(m55Problem(m55src))fail('Migration 055 must contain only the approved revoke statement');
 const m55sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationDir,'055_revoke_extra_table_rights.sql'))).digest('hex');
 if(m55sha!=='7cd7bb7bd115a5188af6d6ce572b8ed39a7b5433a6bb7bf120b4a8101a205d30')fail('Migration 055 differs from the reviewed file (sha256 '+m55sha+')');
 for(const [name,mut] of [['unchanged control',null],['extra DROP TABLE after',m55src+'\ndrop table public.planly_tasks;\n'],['extra statement before','create table public.x(id int);\n'+m55src],['table removed',m55src.replace(', public.planly_list_items','')],['right removed',m55src.replace('references, ','')],['revoked from anon instead',m55src.replace(/from authenticated;\s*$/,'from anon;\n')],['extra statement hidden after a comment semicolon',m55src.replace(/from authenticated;\s*$/,'from authenticated /*;*/; drop table public.planly_tasks;\n')]])
  {if(mut===null){if(m55Problem(m55src))fail('055 control failed');continue}if(mut===m55src)fail('Migration 055 self-test mutation did not change the file: '+name);if(!m55Problem(mut))fail('Migration 055 self-test did not catch: '+name);}
 for(const f of fs.readdirSync(migrationDir).filter(f=>f.endsWith('.sql')))for(const st of sqlStatements(read(`supabase/migrations/${f}`)))if(extraGrant(st))fail(`${f} grants table rights the app never uses to a client role: `+st.slice(0,160));
 for(const st of ['grant all on public.planly_lists to authenticated','grant truncate on public.planly_food_entries to authenticated','grant select, truncate on public.x to anon','grant trigger on table public.x to public'])if(!extraGrant(sqlStatements(st)[0]))fail('Extra-rights grant self-test missed: '+st);
 for(const st of ['grant select, insert, update, delete on public.planly_lists to authenticated','grant execute on function public.f() to authenticated'])if(extraGrant(sqlStatements(st)[0]))fail('Extra-rights grant self-test false positive: '+st);}
// food-search Edge Function: signed-in callers only, fixed Open Food Facts addresses, plain words or a barcode only,
// no database access, no service-role key, no logging, answers to the Planly site only.
{const fn=read('supabase/functions/food-search/index.ts');
 const urls=[...new Set(fn.match(/https:\/\/[^'"`\s)]+/g))].sort();
 if(JSON.stringify(urls)!==JSON.stringify(['https://kovacs-x.github.io','https://kovacs-x.github.io/planly/','https://search.openfoodfacts.org/search','https://world.openfoodfacts.org/api/v2/product/','https://world.openfoodfacts.org/cgi/search.pl']))fail('food-search may only contact fixed Open Food Facts addresses: '+urls.join(' '));
 const envs=[...fn.matchAll(/Deno\.env\.get\('([A-Z_]+)'\)/g)].map(m=>m[1]).sort().join();if(envs!=='SUPABASE_ANON_KEY,SUPABASE_URL')fail('food-search must use only the URL and anon key: '+envs);
 if(/SERVICE_ROLE|\/rest\/v1|\/rpc\/|console\.|localStorage|\.from\(/.test(fn))fail('food-search must not touch the database, use the service key or log anything');
 for(const x of ["'Access-Control-Allow-Origin': ORIGIN","const ORIGIN = 'https://kovacs-x.github.io'","const WORDS = /^[a-z0-9%]{1,30}( [a-z0-9%]{1,30}){0,7}$/","const CODE = /^[0-9]{8,14}$/","if (!WORDS.test(q)) return json({ error: 'Bad search words.' }, 400)","if (!CODE.test(code)) return json({ error: 'Bad barcode.' }, 400)","if (raw === null) return json({ error: 'Request too large.' }, 413)","const MAX_BODY = 500","if (total > max) { await reader.cancel().catch(() => {}); return null }","if (Number.isFinite(declared) && declared > max) { await req.body?.cancel().catch(() => {}); return null }","if (!user?.id) return json({ error: 'Authentication required.' }, 401)"])if(!fn.includes(x))fail('food-search invariant missing: '+x);
 const iAuth=fn.indexOf("fetch(SB + '/auth/v1/user'"),iBody=fn.indexOf('await readLimited(req, MAX_BODY)'),iOff=fn.indexOf('Deno.serve(');
 if(iAuth<iOff||iBody<iAuth)fail('food-search must check the session before reading the request');
 if((fn.match(/\bfetch\(/g)||[]).length!==3||!fn.includes("const r = await fetch(url, { headers: { 'User-Agent': AGENT, Accept: 'application/json' }")||!fn.includes("const r = await fetch(OFF_PRODUCT + code + '.json?'"))fail('food-search fetch calls changed: review the addresses');
 // redirects are never followed (each fetch call, up to its closing bracket, says redirect: 'manual'), and the body is only read through the byte-counting reader
 for(const m of fn.matchAll(/\bfetch\(/g)){const call=fn.slice(m.index,fn.indexOf('\n',m.index));if(!call.includes("redirect: 'manual'"))fail('food-search fetch must not follow redirects: '+call.slice(0,80))}
 if(/req\.(text|json|arrayBuffer|formData|blob)\(/.test(fn))fail('food-search must read the body only through readLimited');}
console.log('Planly security regression checks passed.');
