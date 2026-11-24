-- Planly catalog snapshot: one row per object, (kind, key, val). Read-only. Grantors are dropped from ACLs.
with sch as (select oid, nspname from pg_namespace where nspname in ('public','planly_private')),
fn as (
  select 'function' as kind, n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as key,
         concat_ws(' | ', 'secdef='||p.prosecdef, 'vol='||p.provolatile::text, 'cfg='||coalesce(array_to_string(p.proconfig,','),''),
           'owner='||pg_get_userbyid(p.proowner), 'md5='||md5(regexp_replace(regexp_replace(pg_get_functiondef(p.oid),'--[^\n]*','','g'),'\s','','g'))) as val
  from pg_proc p join sch n on n.oid=p.pronamespace where p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
),
fnacl as (
  select 'function_grant', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         coalesce((select string_agg(distinct case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||':'||a.privilege_type, ',' order by case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||':'||a.privilege_type)
                   from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a), '')
  from pg_proc p join sch n on n.oid=p.pronamespace where p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
),
tbl as (select c.oid, n.nspname, c.relname, c.relkind, c.relacl, c.relowner, c.relrowsecurity, c.relforcerowsecurity from pg_class c join sch n on n.oid=c.relnamespace where c.relkind in ('r','v','m','p')),
tacl as (
  select 'table_grant', nspname||'.'||relname,
         coalesce((select string_agg(distinct case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||':'||a.privilege_type, ',' order by case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||':'||a.privilege_type)
                   from aclexplode(coalesce(relacl, acldefault('r', relowner))) a), '') from tbl
),
colacl as (
  select 'column_grant', t.nspname||'.'||t.relname||'.'||a.attname,
         (select string_agg(distinct pg_get_userbyid(x.grantee)||':'||x.privilege_type, ',' order by pg_get_userbyid(x.grantee)||':'||x.privilege_type) from aclexplode(a.attacl) x)
  from tbl t join pg_attribute a on a.attrelid=t.oid where a.attacl is not null and a.attnum>0 and not a.attisdropped
),
rls as (select 'table', nspname||'.'||relname, 'kind='||relkind::text||' rls='||relrowsecurity||' force='||relforcerowsecurity||' owner='||pg_get_userbyid(relowner) from tbl),
col as (
  select 'column', t.nspname||'.'||t.relname||'.'||a.attname,
         format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(d.adbin,d.adrelid),'')||coalesce(' gen='||nullif(a.attgenerated::text,''),'')
  from tbl t join pg_attribute a on a.attrelid=t.oid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attnum>0 and not a.attisdropped
),
pol as (
  select 'policy', p.schemaname||'.'||p.tablename||'.'||p.policyname,
         concat_ws(' | ', p.permissive, p.cmd, array_to_string(p.roles,','), 'using='||coalesce(p.qual,''), 'check='||coalesce(p.with_check,''))
  from pg_policies p where p.schemaname in ('public','planly_private') or (p.schemaname='realtime' and p.tablename='messages')
),
trg as (
  select 'trigger', n.nspname||'.'||c.relname||'.'||t.tgname, pg_get_triggerdef(t.oid)||' enabled='||t.tgenabled::text
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join sch n on n.oid=c.relnamespace where not t.tgisinternal
),
evt as (select 'event_trigger', e.evtname, e.evtevent||' fn='||e.evtfoid::regprocedure||' enabled='||e.evtenabled::text||' tags='||coalesce(array_to_string(e.evttags,','),'')||' owner='||pg_get_userbyid(e.evtowner) from pg_event_trigger e),
con as (
  select 'constraint', n.nspname||'.'||c.relname||'.'||k.conname, pg_get_constraintdef(k.oid)
  from pg_constraint k join pg_class c on c.oid=k.conrelid join sch n on n.oid=c.relnamespace
),
idx as (select 'index', schemaname||'.'||indexname, indexdef from pg_indexes where schemaname in ('public','planly_private')),
pub as (select 'publication', pubname||'.'||schemaname||'.'||tablename, '' from pg_publication_tables where pubname='supabase_realtime'),
nsacl as (select 'schema_grant', nspname, coalesce((select string_agg(distinct case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||':'||a.privilege_type, ',' order by case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end||':'||a.privilege_type) from aclexplode(coalesce(nspacl, acldefault('n', nspowner))) a),'') from pg_namespace where nspname in ('public','planly_private'))
select kind, key, regexp_replace(val, E'\\s+', ' ', 'g') from (
  select * from fn union all select * from fnacl union all select * from tacl union all select * from colacl union all select * from rls
  union all select * from col union all select * from pol union all select * from trg union all select * from evt
  union all select * from con union all select * from idx union all select * from pub union all select * from nsacl
) s(kind,key,val) order by kind, key;
