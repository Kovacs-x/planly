-- Notifications: quiet hours you choose, instant alerts, shared-task reminders and 0% deal reminders (2 Nov 2026).
--
-- 1) Quiet hours per phone. New columns on planly_private.push_subscriptions: quiet_on (default on), quiet_start
--    (default 22:00) and quiet_end (default 07:00), local time. The window may cross midnight. Start and end must
--    differ. Nothing is sent inside the window except test messages; chore alerts wait until it ends (as before).
-- 2) Instant alerts. A statement trigger on planly_private.push_outbox asks pg_net to call the planly-push Edge
--    Function straight away (pg_net sends after the transaction commits), so chore alerts and test messages no longer
--    wait for the schedule. The schedule itself moves from every 5 minutes to every minute, so task reminders arrive on
--    time. The trigger never blocks the insert; if the call fails, the next scheduled run sends the message.
-- 3) Shared-task reminders. Task reminders now also cover shared household tasks (in a household the person belongs
--    to) assigned to them or to Anyone, not just their own private tasks. Same 15-minute window and the same ref, so
--    nothing already sent is sent again.
-- 4) 0% deal reminders. New column notify_deals (default on). For every live, open budget debt the person can see
--    (their personal budget, or a Household budget they belong to) with a 0% end date and money left on it, one
--    reminder when 30 days or fewer remain and another when 7 days or fewer remain, after the morning summary time
--    and outside quiet hours. "Money left" is worked out the same way as in the app: the statement balance minus
--    linked bills ticked as paid after the statement date.
-- Browser RPCs: planly_save_push_subscription takes four new optional arguments (null keeps the phone's current value;
-- a new phone gets the defaults); planly_get_push_subscription returns them. Owner is still always auth.uid().
-- Worker RPCs stay service_role only. No data is changed or deleted.

alter table planly_private.push_subscriptions
  add column if not exists quiet_on boolean not null default true,
  add column if not exists quiet_start time not null default '22:00',
  add column if not exists quiet_end time not null default '07:00',
  add column if not exists notify_deals boolean not null default true;

alter table planly_private.push_subscriptions drop constraint if exists push_quiet_window;
alter table planly_private.push_subscriptions add constraint push_quiet_window check (quiet_start <> quiet_end);

create or replace function planly_private.push_is_quiet(p_on boolean, p_start time, p_end time, p_at time)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_on, false) and case
    when p_start < p_end then p_at >= p_start and p_at < p_end
    else p_at >= p_start or p_at < p_end end
$$;
revoke all on function planly_private.push_is_quiet(boolean, time, time, time) from public, anon, authenticated;

-- ---------- Browser RPCs ----------

drop function if exists public.planly_save_push_subscription(text,text,text,text,boolean,boolean,boolean,time);
drop function if exists planly_private.save_push_subscription(text,text,text,text,boolean,boolean,boolean,time);

create or replace function planly_private.push_prefs(s planly_private.push_subscriptions)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_build_object('notify_tasks', s.notify_tasks, 'notify_chores', s.notify_chores,
    'notify_summary', s.notify_summary, 'summary_time', to_char(s.summary_time, 'HH24:MI'),
    'notify_deals', s.notify_deals, 'quiet_on', s.quiet_on,
    'quiet_start', to_char(s.quiet_start, 'HH24:MI'), 'quiet_end', to_char(s.quiet_end, 'HH24:MI'))
$$;
revoke all on function planly_private.push_prefs(planly_private.push_subscriptions) from public, anon, authenticated;

create or replace function planly_private.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text,
  p_notify_tasks boolean, p_notify_chores boolean, p_notify_summary boolean, p_summary_time time,
  p_notify_deals boolean default null, p_quiet_on boolean default null,
  p_quiet_start time default null, p_quiet_end time default null
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
  if p_quiet_start is not null and p_quiet_start = coalesce(p_quiet_end,
       (select s.quiet_end from planly_private.push_subscriptions s where s.endpoint = p_endpoint), '07:00') then
    raise exception 'Quiet hours need different start and end times' using errcode = '22023';
  end if;
  if p_quiet_end is not null and p_quiet_end = coalesce(p_quiet_start,
       (select s.quiet_start from planly_private.push_subscriptions s where s.endpoint = p_endpoint), '22:00') then
    raise exception 'Quiet hours need different start and end times' using errcode = '22023';
  end if;
  insert into planly_private.push_subscriptions as s
    (user_id, endpoint, p256dh, auth_secret, time_zone, notify_tasks, notify_chores, notify_summary, summary_time,
     notify_deals, quiet_on, quiet_start, quiet_end)
  values (v_user, p_endpoint, p_p256dh, p_auth, p_time_zone,
    coalesce(p_notify_tasks, true), coalesce(p_notify_chores, true), coalesce(p_notify_summary, true), coalesce(p_summary_time, '07:30'),
    coalesce(p_notify_deals, true), coalesce(p_quiet_on, true), coalesce(p_quiet_start, '22:00'), coalesce(p_quiet_end, '07:00'))
  on conflict (endpoint) do update set
    -- The endpoint is held by this phone's browser, so whoever is signed in on it now owns it.
    user_id = v_user, p256dh = excluded.p256dh, auth_secret = excluded.auth_secret, time_zone = excluded.time_zone,
    notify_tasks = excluded.notify_tasks, notify_chores = excluded.notify_chores,
    notify_summary = excluded.notify_summary, summary_time = excluded.summary_time,
    notify_deals = coalesce(p_notify_deals, s.notify_deals), quiet_on = coalesce(p_quiet_on, s.quiet_on),
    quiet_start = coalesce(p_quiet_start, s.quiet_start), quiet_end = coalesce(p_quiet_end, s.quiet_end),
    updated_at = now(), revoked_at = null, failures = 0
  returning * into v_row;
  return planly_private.push_prefs(v_row);
end;
$$;

create or replace function planly_private.get_push_subscription(p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select planly_private.push_prefs(s)
  from planly_private.push_subscriptions s
  where s.endpoint = p_endpoint and s.user_id = auth.uid() and s.revoked_at is null
$$;

create or replace function public.planly_save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_time_zone text,
  p_notify_tasks boolean, p_notify_chores boolean, p_notify_summary boolean, p_summary_time time,
  p_notify_deals boolean default null, p_quiet_on boolean default null,
  p_quiet_start time default null, p_quiet_end time default null
)
returns jsonb language sql set search_path = pg_catalog, public
as $$ select planly_private.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_time_zone, p_notify_tasks,
  p_notify_chores, p_notify_summary, p_summary_time, p_notify_deals, p_quiet_on, p_quiet_start, p_quiet_end) $$;

revoke all on function planly_private.save_push_subscription(text,text,text,text,boolean,boolean,boolean,time,boolean,boolean,time,time) from public, anon, authenticated;
grant execute on function planly_private.save_push_subscription(text,text,text,text,boolean,boolean,boolean,time,boolean,boolean,time,time) to authenticated;
revoke all on function public.planly_save_push_subscription(text,text,text,text,boolean,boolean,boolean,time,boolean,boolean,time,time) from public, anon;
grant execute on function public.planly_save_push_subscription(text,text,text,text,boolean,boolean,boolean,time,boolean,boolean,time,time) to authenticated;
-- get_push_subscription keeps its signature and grants (create or replace).

-- ---------- Instant alerts: a new outbox row calls planly-push straight away ----------

create or replace function planly_private.push_kick()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform net.http_post(
    url := 'https://dtniwcwjucepsjzoojuc.supabase.co/functions/v1/planly-push',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-planly-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'planly_push_cron_secret')),
    timeout_milliseconds := 20000);
  return null;
exception when others then
  -- A notification problem must never block saving; the scheduled run picks the message up.
  return null;
end;
$$;
revoke all on function planly_private.push_kick() from public, anon, authenticated;

create or replace trigger push_outbox_kick
after insert on planly_private.push_outbox
for each statement execute function planly_private.push_kick();

-- ---------- Worker ----------

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
  v_overdue integer;
begin
  for s in select * from planly_private.push_subscriptions where revoked_at is null loop
    v_local := p_now at time zone s.time_zone;
    v_date := v_local::date;
    v_quiet := planly_private.push_is_quiet(s.quiet_on, s.quiet_start, s.quiet_end, v_local::time);
    v_msgs := '[]'::jsonb;

    -- Task reminders, due in the last 15 minutes: the person's own private timed tasks, plus shared household tasks
    -- (in a household they belong to) assigned to them or to Anyone.
    if s.notify_tasks and not v_quiet then
      with due as (
        select t.cloud_id, t.title, t.task_date, t.task_time, coalesce(t.reminder, 'none') as reminder,
               (t.task_date + t.task_time) - planly_private.push_reminder_offset(t.reminder) as fire_at,
               t.cloud_id::text || ':' || t.task_date || ':' || t.task_time || ':' || coalesce(t.reminder, 'none') as ref
        from public.planly_tasks t
        where t.deleted_at is null and coalesce(t.completed, false) = false
          and t.task_time is not null and t.task_date between v_date and v_date + 1
          and (
            (t.owner_id = s.user_id and t.visibility is distinct from 'household')
            or (t.visibility = 'household' and (t.assignee_id is null or t.assignee_id = s.user_id)
                and t.household_id in (select m.household_id from public.planly_household_members m where m.user_id = s.user_id))
          )
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

    -- Morning summary (unchanged from 053 apart from quiet hours).
    if s.notify_summary and not v_quiet and v_local::time >= s.summary_time and v_local::time < s.summary_time + interval '2 hours' then
      with mine as (
        select t.title, t.task_time, t.task_date
        from public.planly_tasks t
        where t.deleted_at is null and coalesce(t.completed, false) = false and t.task_date <= v_date
          and (
            (t.owner_id = s.user_id and t.visibility is distinct from 'household')
            or (t.visibility = 'household' and (t.assignee_id is null or t.assignee_id = s.user_id)
                and t.household_id in (select m.household_id from public.planly_household_members m where m.user_id = s.user_id))
          )
      )
      select count(*) filter (where task_date = v_date), count(*) filter (where task_date < v_date),
             string_agg(line, ', ' order by ord) filter (where ord <= 3 and task_date = v_date)
        into v_count, v_overdue, v_lines
      from (
        select m.task_date,
               row_number() over (partition by m.task_date = v_date order by m.task_time nulls last, m.title) as ord,
               case when m.task_time is null then m.title else to_char(m.task_time, 'HH24:MI') || ' ' || m.title end as line
        from mine m
      ) x;
      if v_count > 0 or v_overdue > 0 then
        insert into planly_private.push_sent(subscription_id, kind, ref) values (s.id, 'summary', v_date::text)
        on conflict do nothing;
        if found then
          v_msgs := v_msgs || jsonb_build_object('kind', 'summary', 'tag', 'summary-' || v_date,
            'title', case when v_count = 0 then 'Nothing planned today'
                          when v_count = 1 then '1 task today' else v_count || ' tasks today' end,
            'body', left(concat_ws(' · ',
                nullif(coalesce(v_lines, '') || case when v_count > 3 then ' +' || (v_count - 3) || ' more' else '' end, ''),
                case when v_overdue = 1 then '1 overdue' when v_overdue > 1 then v_overdue || ' overdue' end), 240));
        end if;
      end if;
    end if;

    -- 0% deals ending: 30 days or fewer left, then 7 days or fewer left. After the summary time, outside quiet hours.
    if s.notify_deals and not v_quiet and v_local::time >= s.summary_time then
      with deals as (
        select d.id, btrim(d.name) as name, d.zero_until, d.zero_until - v_date as days_left,
               greatest(0, d.balance_minor - coalesce((
                 select sum(e.amount_minor) from public.planly_budget_entries e
                 where e.debt_id = d.id and e.deleted_at is null and e.kind = 'expense'
                   and e.allocation_status = 'paid' and e.entry_date > d.balance_on), 0)) as left_minor
        from public.planly_budget_debts d
        join public.planly_budget_scopes sc on sc.id = d.scope_id and sc.deleted_at is null
        where d.deleted_at is null and d.closed_on is null and d.zero_until is not null
          and d.zero_until - v_date between 0 and 30
          and ((sc.scope_type = 'personal' and sc.owner_id = s.user_id)
            or (sc.scope_type = 'household' and sc.household_id in
                 (select m.household_id from public.planly_household_members m where m.user_id = s.user_id)))
      ), due as (
        select x.*, x.id::text || ':' || x.zero_until || ':' || case when x.days_left <= 7 then '7' else '30' end as ref
        from deals x where x.left_minor > 0
      ), claimed as (
        insert into planly_private.push_sent(subscription_id, kind, ref)
        select s.id, 'deal', d.ref from due d
        on conflict do nothing
        returning ref
      )
      select coalesce(jsonb_agg(jsonb_build_object('kind', 'deal', 'tag', 'deal-' || d.id,
          'title', left(d.name, 120),
          'body', '0% ends ' || case when d.days_left = 0 then 'today'
                                     when d.days_left = 1 then 'tomorrow'
                                     else 'in ' || d.days_left || ' days' end
                  || ' (' || to_char(d.zero_until, 'Dy FMDD Mon') || ') · £'
                  || to_char(d.left_minor / 100.0, 'FM999,999,990.00') || ' left') order by d.zero_until, d.name), '[]'::jsonb)
        into v_part
      from due d join claimed c on c.ref = d.ref;
      v_msgs := v_msgs || v_part;
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

revoke all on function public.planly_push_worklist(timestamptz) from public, anon, authenticated;
grant execute on function public.planly_push_worklist(timestamptz) to service_role;

-- ---------- Schedule: every minute instead of every 5 minutes ----------
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'planly-push'), schedule := '* * * * *');
