-- Push notifications (Musti's choice, 5 Oct 2026):
--   * a reminder for each of your own timed tasks today (at its Reminder setting, or at its start time);
--   * a short morning summary of today's own tasks (not chores), at a time each person picks;
--   * an alert when the other household member assigns you a chore;
--   * nothing between 22:00 and 07:00 local time (chore alerts wait until 07:00);
--   * each person/phone has its own on/off switches.
--
-- Design
-- 1) Everything lives in planly_private (not exposed to the browser API). The browser only calls the
--    SECURITY DEFINER wrappers below, which always use auth.uid() as the owner; ownership is never taken
--    from the browser. Endpoints are limited to the real Web Push services (no arbitrary URLs).
-- 2) A trigger on planly_tasks queues a 'chore_assigned' message when someone assigns a live household
--    task to the OTHER member (new chore, or assignee changed). Later occurrences of a repeating chore
--    (series rows) are not "assignments" and are skipped.
-- 3) planly_push_worklist() (service_role only) works out what is due for each phone and claims it in
--    planly_private.push_sent in the same statement, so overlapping runs never send twice.
--    planly_push_report() records the result; a 404/410 from the push service revokes that phone.
-- 4) pg_cron calls the planly-push Edge Function every 5 minutes. Its shared secret, and the VAPID
--    keys, are stored in Supabase Vault (never in the repo or in browser code).
-- 5) Only planly_tasks data is used. External calendars (including private ICS feeds) are never read.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists planly_private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  time_zone text not null default 'Europe/London',
  notify_tasks boolean not null default true,
  notify_chores boolean not null default true,
  notify_summary boolean not null default true,
  summary_time time not null default '07:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failures integer not null default 0,
  revoked_at timestamptz,
  constraint push_endpoint_service check (
    length(endpoint) <= 1024 and endpoint ~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/'
  ),
  constraint push_keys_shape check (
    p256dh ~ '^[A-Za-z0-9_-]{80,100}$' and auth_secret ~ '^[A-Za-z0-9_-]{16,30}$'
  ),
  constraint push_time_zone_shape check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' and length(time_zone) <= 64)
);
create index if not exists push_subscriptions_user_idx on planly_private.push_subscriptions(user_id);

create table if not exists planly_private.push_sent (
  subscription_id uuid not null references planly_private.push_subscriptions(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, kind, ref)
);

create table if not exists planly_private.push_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chore_assigned', 'test')),
  title text not null check (length(title) <= 120),
  body text not null check (length(body) <= 240),
  created_at timestamptz not null default now()
);
create index if not exists push_outbox_recipient_idx on planly_private.push_outbox(recipient_id, created_at);

alter table planly_private.push_subscriptions enable row level security;
alter table planly_private.push_sent enable row level security;
alter table planly_private.push_outbox enable row level security;
revoke all on planly_private.push_subscriptions, planly_private.push_sent, planly_private.push_outbox from public, anon, authenticated;

-- ---------- Browser RPCs (owner = auth.uid(), always) ----------

create or replace function planly_private.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text,
  p_notify_tasks boolean, p_notify_chores boolean, p_notify_summary boolean, p_summary_time time
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_row planly_private.push_subscriptions;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  begin
    perform now() at time zone p_time_zone;
  exception when others then
    raise exception 'Unknown time zone' using errcode = '22023';
  end;
  insert into planly_private.push_subscriptions as s
    (user_id, endpoint, p256dh, auth_secret, time_zone, notify_tasks, notify_chores, notify_summary, summary_time)
  values (v_user, p_endpoint, p_p256dh, p_auth, p_time_zone,
    coalesce(p_notify_tasks, true), coalesce(p_notify_chores, true), coalesce(p_notify_summary, true), coalesce(p_summary_time, '07:30'))
  on conflict (endpoint) do update set
    -- The endpoint is held by this phone's browser, so whoever is signed in on it now owns it.
    user_id = v_user, p256dh = excluded.p256dh, auth_secret = excluded.auth_secret, time_zone = excluded.time_zone,
    notify_tasks = excluded.notify_tasks, notify_chores = excluded.notify_chores,
    notify_summary = excluded.notify_summary, summary_time = excluded.summary_time,
    updated_at = now(), revoked_at = null, failures = 0
  returning * into v_row;
  return jsonb_build_object('notify_tasks', v_row.notify_tasks, 'notify_chores', v_row.notify_chores,
    'notify_summary', v_row.notify_summary, 'summary_time', to_char(v_row.summary_time, 'HH24:MI'));
end;
$$;

create or replace function planly_private.get_push_subscription(p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object('notify_tasks', s.notify_tasks, 'notify_chores', s.notify_chores,
    'notify_summary', s.notify_summary, 'summary_time', to_char(s.summary_time, 'HH24:MI'))
  from planly_private.push_subscriptions s
  where s.endpoint = p_endpoint and s.user_id = auth.uid() and s.revoked_at is null
$$;

create or replace function planly_private.revoke_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update planly_private.push_subscriptions set revoked_at = now(), updated_at = now()
  where endpoint = p_endpoint and user_id = auth.uid() and revoked_at is null;
  return found;
end;
$$;

create or replace function planly_private.queue_test_push()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if exists (select 1 from planly_private.push_outbox o
             where o.recipient_id = v_user and o.kind = 'test' and o.created_at > now() - interval '1 minute') then
    return false;
  end if;
  insert into planly_private.push_outbox(recipient_id, kind, title, body)
  values (v_user, 'test', 'Planly', 'Notifications are working on this phone.');
  return true;
end;
$$;

revoke all on function planly_private.save_push_subscription(text,text,text,text,boolean,boolean,boolean,time) from public, anon, authenticated;
revoke all on function planly_private.get_push_subscription(text) from public, anon, authenticated;
revoke all on function planly_private.revoke_push_subscription(text) from public, anon, authenticated;
revoke all on function planly_private.queue_test_push() from public, anon, authenticated;
grant execute on function planly_private.save_push_subscription(text,text,text,text,boolean,boolean,boolean,time) to authenticated;
grant execute on function planly_private.get_push_subscription(text) to authenticated;
grant execute on function planly_private.revoke_push_subscription(text) to authenticated;
grant execute on function planly_private.queue_test_push() to authenticated;

create or replace function public.planly_save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text,
  p_notify_tasks boolean, p_notify_chores boolean, p_notify_summary boolean, p_summary_time time
)
returns jsonb language sql set search_path = pg_catalog, public
as $$ select planly_private.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_time_zone, p_notify_tasks, p_notify_chores, p_notify_summary, p_summary_time) $$;
create or replace function public.planly_get_push_subscription(p_endpoint text)
returns jsonb language sql stable set search_path = pg_catalog, public
as $$ select planly_private.get_push_subscription(p_endpoint) $$;
create or replace function public.planly_revoke_push_subscription(p_endpoint text)
returns boolean language sql set search_path = pg_catalog, public
as $$ select planly_private.revoke_push_subscription(p_endpoint) $$;
create or replace function public.planly_queue_test_push()
returns boolean language sql set search_path = pg_catalog, public
as $$ select planly_private.queue_test_push() $$;

revoke all on function public.planly_save_push_subscription(text,text,text,text,boolean,boolean,boolean,time) from public, anon;
revoke all on function public.planly_get_push_subscription(text) from public, anon;
revoke all on function public.planly_revoke_push_subscription(text) from public, anon;
revoke all on function public.planly_queue_test_push() from public, anon;
grant execute on function public.planly_save_push_subscription(text,text,text,text,boolean,boolean,boolean,time) to authenticated;
grant execute on function public.planly_get_push_subscription(text) to authenticated;
grant execute on function public.planly_revoke_push_subscription(text) to authenticated;
grant execute on function public.planly_queue_test_push() to authenticated;

-- ---------- Chore assignment → outbox ----------

create or replace function planly_private.queue_chore_assigned_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
begin
  if v_actor is null or new.assignee_id is null or new.assignee_id = v_actor then return new; end if;
  if new.visibility is distinct from 'household' or new.household_id is null
     or new.deleted_at is not null or coalesce(new.completed, false) then return new; end if;
  if tg_op = 'INSERT' and coalesce(new.series_client_id, new.client_id) <> new.client_id then return new; end if;
  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then return new; end if;
  -- Both people must be members of the task's household.
  if not exists (select 1 from public.planly_household_members m where m.household_id = new.household_id and m.user_id = v_actor)
     or not exists (select 1 from public.planly_household_members m where m.household_id = new.household_id and m.user_id = new.assignee_id)
  then return new; end if;
  select nullif(btrim(m.display_name), '') into v_name
  from public.planly_household_members m where m.household_id = new.household_id and m.user_id = v_actor;
  insert into planly_private.push_outbox(recipient_id, kind, title, body)
  values (new.assignee_id, 'chore_assigned', 'New chore for you',
    left(coalesce(v_name, 'Your partner') || ' assigned you: ' || coalesce(nullif(btrim(new.title), ''), 'a chore'), 240));
  return new;
exception when others then
  -- A notification problem must never block saving a task.
  return new;
end;
$$;
revoke all on function planly_private.queue_chore_assigned_push() from public, anon, authenticated;

create or replace trigger planly_tasks_chore_assigned_push
after insert or update of assignee_id on public.planly_tasks
for each row execute function planly_private.queue_chore_assigned_push();

-- ---------- Worker RPCs (service_role only; called by the planly-push Edge Function) ----------

create or replace function planly_private.push_reminder_offset(p_reminder text)
returns interval
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_reminder
    when '5-min' then interval '5 minutes'
    when '15-min' then interval '15 minutes'
    when '30-min' then interval '30 minutes'
    when '60-min' then interval '1 hour'
    when '1440-min' then interval '1 day'
    else interval '0' end
$$;

create or replace function public.planly_push_config()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'vapid_public', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_vapid_public'),
    'vapid_private', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_vapid_private'),
    'cron_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_cron_secret'))
$$;

create or replace function public.planly_push_worklist(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  s record;
  v_local timestamp;
  v_date date;
  v_quiet boolean;
  v_msgs jsonb;
  v_part jsonb;
  v_count integer;
  v_lines text;
begin
  for s in select * from planly_private.push_subscriptions where revoked_at is null loop
    v_local := p_now at time zone s.time_zone;
    v_date := v_local::date;
    v_quiet := v_local::time >= time '22:00' or v_local::time < time '07:00';
    v_msgs := '[]'::jsonb;

    -- Task reminders: own (non-household) timed tasks, due in the last 15 minutes.
    if s.notify_tasks and not v_quiet then
      with due as (
        select t.cloud_id, t.title, t.task_date, t.task_time, coalesce(t.reminder, 'none') as reminder,
               (t.task_date + t.task_time) - planly_private.push_reminder_offset(t.reminder) as fire_at,
               t.cloud_id::text || ':' || t.task_date || ':' || t.task_time || ':' || coalesce(t.reminder, 'none') as ref
        from public.planly_tasks t
        where t.owner_id = s.user_id and t.deleted_at is null and coalesce(t.completed, false) = false
          and t.visibility is distinct from 'household'
          and t.task_time is not null and t.task_date between v_date and v_date + 1
      ), claimed as (
        insert into planly_private.push_sent(subscription_id, kind, ref)
        select s.id, 'task', d.ref from due d
        where d.fire_at <= v_local and d.fire_at > v_local - interval '15 minutes'
        on conflict do nothing
        returning ref
      )
      select coalesce(jsonb_agg(jsonb_build_object('kind', 'task', 'tag', 'task-' || d.cloud_id,
          'title', left(coalesce(nullif(btrim(d.title), ''), 'Task'), 120),
          'body', case when d.reminder in ('none', 'at-time') then 'Starting now · ' || to_char(d.task_time, 'HH24:MI')
                       when d.task_date > v_date then 'Tomorrow at ' || to_char(d.task_time, 'HH24:MI')
                       else 'Today at ' || to_char(d.task_time, 'HH24:MI') end) order by d.fire_at), '[]'::jsonb)
        into v_part
      from due d join claimed c on c.ref = d.ref;
      v_msgs := v_msgs || v_part;
    end if;

    -- Morning summary: own (non-household) tasks today, within 2 hours after the chosen time.
    if s.notify_summary and not v_quiet and v_local::time >= s.summary_time and v_local::time < s.summary_time + interval '2 hours' then
      select count(*), string_agg(line, ', ' order by ord) into v_count, v_lines
      from (
        select row_number() over (order by t.task_time nulls last, t.title) as ord,
               case when t.task_time is null then t.title else to_char(t.task_time, 'HH24:MI') || ' ' || t.title end as line
        from public.planly_tasks t
        where t.owner_id = s.user_id and t.deleted_at is null and coalesce(t.completed, false) = false
          and t.visibility is distinct from 'household' and t.task_date = v_date
      ) x where ord <= 3;
      if v_count > 0 then
        select count(*) into v_count from public.planly_tasks t
        where t.owner_id = s.user_id and t.deleted_at is null and coalesce(t.completed, false) = false
          and t.visibility is distinct from 'household' and t.task_date = v_date;
        insert into planly_private.push_sent(subscription_id, kind, ref) values (s.id, 'summary', v_date::text)
        on conflict do nothing;
        if found then
          v_msgs := v_msgs || jsonb_build_object('kind', 'summary', 'tag', 'summary-' || v_date,
            'title', case when v_count = 1 then '1 task today' else v_count || ' tasks today' end,
            'body', left(v_lines || case when v_count > 3 then ' +' || (v_count - 3) || ' more' else '' end, 240));
        end if;
      end if;
    end if;

    -- Outbox: chore assignments (held during quiet hours) and test messages (always), last 24 hours.
    with c as (
      insert into planly_private.push_sent(subscription_id, kind, ref)
      select s.id, 'outbox', o.id::text
      from planly_private.push_outbox o
      where o.recipient_id = s.user_id and o.created_at > p_now - interval '24 hours'
        and o.created_at >= s.created_at - interval '1 minute'
        and (o.kind = 'test' or (o.kind = 'chore_assigned' and s.notify_chores and not v_quiet))
      on conflict do nothing
      returning ref
    )
    select coalesce(jsonb_agg(jsonb_build_object('kind', o.kind, 'tag', o.kind || '-' || o.id,
        'title', o.title, 'body', o.body) order by o.id), '[]'::jsonb)
      into v_part
    from planly_private.push_outbox o join c on c.ref = o.id::text;
    v_msgs := v_msgs || v_part;

    if jsonb_array_length(v_msgs) > 0 then
      v_out := v_out || jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh,
        'auth', s.auth_secret, 'messages', v_msgs);
    end if;
  end loop;
  return v_out;
end;
$$;

create or replace function public.planly_push_report(p_subscription_id uuid, p_ok boolean, p_gone boolean)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update planly_private.push_subscriptions set
    last_sent_at = case when p_ok then now() else last_sent_at end,
    failures = case when p_ok then 0 else failures + 1 end,
    revoked_at = case when p_gone or (not p_ok and failures >= 20) then coalesce(revoked_at, now()) else revoked_at end
  where id = p_subscription_id
$$;

revoke all on function planly_private.push_reminder_offset(text) from public, anon, authenticated;
revoke all on function public.planly_push_config() from public, anon, authenticated;
revoke all on function public.planly_push_worklist(timestamptz) from public, anon, authenticated;
revoke all on function public.planly_push_report(uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.planly_push_config() to service_role;
grant execute on function public.planly_push_worklist(timestamptz) to service_role;
grant execute on function public.planly_push_report(uuid,boolean,boolean) to service_role;

-- ---------- Schedule: every 5 minutes, call the planly-push Edge Function ----------
select cron.schedule('planly-push', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://dtniwcwjucepsjzoojuc.supabase.co/functions/v1/planly-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-planly-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000)
$cron$);
