-- Morning summary covers shared tasks and overdue tasks (11 Oct 2026).
--
-- Before: the morning summary counted only the person's own private tasks dated today, and was silent when there were
-- none. Almost all of Musti's tasks are shared household tasks, so he never got one.
-- Now (Musti's choice), public.planly_push_worklist's summary also counts shared household tasks dated today that are
-- assigned to the person or to Anyone (not to the other member), in a household the person belongs to, and adds
-- "N overdue" for such tasks dated before today and not done. It is sent when there is at least one task today or
-- overdue; with none today the title is "Nothing planned today". Still once per day, within 2 hours after the chosen
-- time, and never in quiet hours (22:00-07:00).
-- Unchanged: task reminders, the outbox (chore assignments, test messages), quiet hours, owner, search_path and
-- grants (service_role only). No data is changed.

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

    -- Morning summary, within 2 hours after the chosen time. Counts the person's tasks for today: their own private
    -- tasks, plus shared household tasks (in a household they belong to) assigned to them or to Anyone, but not
    -- tasks assigned to the other member. Also mentions how many such tasks are overdue (dated before today, not done).
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
