// In-memory Supabase (auth + PostgREST + rpc) mock for auditing the real Planly build.
import crypto from 'node:crypto';
export const ME = '11111111-1111-4111-8111-111111111111';
export const PARTNER = '22222222-2222-4222-8222-222222222222';
export const HH = '33333333-3333-4333-8333-333333333333';
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export function session(uid = ME, email = 'alex@example.test', ttl = 3600 * 24) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, email, role: 'authenticated', aud: 'authenticated', exp })}.sig`;
  return { access_token: token, token_type: 'bearer', expires_in: ttl, expires_at: exp, refresh_token: 'refresh-' + uid,
    user: { id: uid, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' } };
}
const d = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
const ms = Date.now();
function task(o) {
  const id = o.client_id || `${ms}-${Math.random().toString(16).slice(2, 14)}`;
  const row = { cloud_id: uuid(), owner_id: ME, client_id: id, series_client_id: null, title: 'Task', task_date: d(0), task_time: null, duration_minutes: 30, priority: 'normal',
    category: 'Personal', project_client_id: null, recurrence: 'none', recurrence_config: null, occurrence_number: null, reminder: 'none', notes: '', subtasks: [], completed: false,
    pinned: false, top3_order: null, add_to_calendar: false, google_event_id: null, google_recurrence_start_date: null, google_recurrence_version: null, calendar_sync: '',
    calendar_synced_at: null, client_created_at: ms, client_updated_at: ms, cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso(),
    visibility: 'private', household_id: null, assignee_id: null, completed_by: null, completed_at: null, ...o };
  row.data = { id, title: row.title, date: row.task_date || '', time: row.task_time ? row.task_time.slice(0, 5) : '', notes: row.notes, pinned: row.pinned, category: row.category,
    priority: row.priority, reminder: row.reminder, subtasks: row.subtasks, completed: row.completed, createdAt: ms, updatedAt: ms, projectId: row.project_client_id || '',
    recurrence: row.recurrence, recurrenceConfig: row.recurrence_config, durationMinutes: row.duration_minutes, top3Order: row.top3_order, visibility: row.visibility,
    householdId: row.household_id, assigneeId: row.assignee_id, occurrenceNumber: row.occurrence_number };
  return row;
}
function project(o) {
  const id = o.client_id || `${ms}-p${Math.random().toString(16).slice(2, 10)}`;
  const row = { cloud_id: uuid(), owner_id: ME, client_id: id, name: 'Project', due_date: null, notes: '', archived: false, client_created_at: ms, client_updated_at: ms,
    cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso(), visibility: 'private', household_id: null, ...o };
  row.data = { id, name: row.name, notes: row.notes, dueDate: row.due_date || '', archived: row.archived, createdAt: ms, updatedAt: ms, visibility: row.visibility, householdId: row.household_id };
  return row;
}
export function seed() {
  const pRenov = project({ name: 'Kitchen renovation', due_date: d(10), client_id: 'proj-renov' });
  const pExam = project({ name: 'Exam revision', due_date: d(3), client_id: 'proj-exam' });
  const pShared = project({ name: 'Holiday planning', due_date: d(40), client_id: 'proj-holiday', visibility: 'household', household_id: HH });
  const pOld = project({ name: 'Old project', archived: true, client_id: 'proj-old' });
  const weekly = { unit: 'weeks', endDate: '', endMode: 'never', ordinal: 1, weekday: new Date().getDay(), interval: 1, monthDay: new Date().getDate(), weekdays: [new Date().getDay()], anchorDate: d(0), monthlyMode: 'day', maxOccurrences: 10 };
  const tasks = [
    task({ title: 'Team stand-up', task_time: '09:00:00', duration_minutes: 30, recurrence: 'weekly', recurrence_config: weekly, occurrence_number: 1, client_id: 'task-standup' }),
    task({ title: 'Dentist appointment', task_time: '14:00:00', duration_minutes: 60, category: 'Health', priority: 'high', client_id: 'task-dentist' }),
    task({ title: 'Revise chapter 4', task_time: '17:00:00', duration_minutes: 120, project_client_id: 'proj-exam', priority: 'high', client_id: 'task-rev4',
      subtasks: [{ id: 's1', title: 'Read notes', done: true }, { id: 's2', title: 'Practice questions', done: false }] }),
    task({ title: 'Pay credit card', task_date: d(-2), priority: 'high', category: 'Finance', client_id: 'task-overdue' }),
    task({ title: 'Buy groceries', task_date: d(1), duration_minutes: 45, client_id: 'task-groceries', pinned: true }),
    task({ title: 'Order tiles', task_date: d(2), project_client_id: 'proj-renov', client_id: 'task-tiles' }),
    task({ title: 'Book flights', task_date: d(5), project_client_id: 'proj-holiday', visibility: 'household', household_id: HH, assignee_id: PARTNER, client_id: 'task-flights' }),
    task({ title: 'Clean bathroom', task_date: d(0), visibility: 'household', household_id: HH, assignee_id: null, client_id: 'task-bathroom', category: 'Home' }),
    task({ title: 'Take bins out', task_date: d(0), visibility: 'household', household_id: HH, assignee_id: null, client_id: 'task-bins', category: 'Home', recurrence: 'weekly', recurrence_config: weekly, occurrence_number: 1 }),
    task({ title: 'Call plumber', task_date: null, client_id: 'task-inbox' }),
    task({ title: 'Laundry', task_date: d(0), task_time: '19:00:00', duration_minutes: 90, client_id: 'task-laundry', category: 'Home' }),
    task({ title: 'Submit report', task_date: d(-1), completed: true, client_id: 'task-done' }),
    task({ title: 'Partner shared task', owner_id: PARTNER, task_date: d(0), visibility: 'household', household_id: HH, assignee_id: ME, client_id: 'task-partner-assigned' }),
  ];
  // Overload tomorrow a little + a long upcoming list for scale
  for (let i = 0; i < 25; i++) tasks.push(task({ title: `Backlog item ${i + 1}`, task_date: d(3 + (i % 20)), client_id: `task-bulk-${i}`, duration_minutes: 30 + (i % 4) * 15 }));
  const srcId = uuid();
  const events = [];
  for (let off = -3; off <= 30; off++) {
    if ([1, 2, 5, 8, 9, 12].includes((off + 40) % 7 + (off % 3))) {
      const date = d(off);
      events.push({ id: uuid(), source_id: srcId, owner_id: ME, external_uid: 'shift-' + off, title: 'Long day shift', description: null, location: 'Ward 7', starts_at: `${date}T07:30:00+00:00`, ends_at: `${date}T20:00:00+00:00`,
        is_all_day: false, start_date: date, end_date: date, source_updated_at: nowIso(), created_at: nowIso(), updated_at: nowIso() });
    }
  }
  events.push({ id: uuid(), source_id: srcId, owner_id: ME, external_uid: 'shift-today', title: 'Early shift', description: null, location: null, starts_at: `${d(0)}T07:00:00+00:00`, ends_at: `${d(0)}T12:00:00+00:00`, is_all_day: false, start_date: d(0), end_date: d(0), source_updated_at: nowIso(), created_at: nowIso(), updated_at: nowIso() });
  const scopeP = uuid(), scopeH = uuid();
  const cat = (scope, name, kind, owner = ME) => ({ id: uuid(), scope_id: scope, owner_id: owner, client_id: 'c-' + uuid(), name, kind, icon_key: 'wallet', color_key: 'violet', sort_order: 0, archived: false, client_created_at: ms, client_updated_at: ms, cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso() });
  const cRent = cat(scopeP, 'Rent', 'expense'), cSalary = cat(scopeP, 'Salary', 'income'), cBills = cat(scopeH, 'Bills', 'expense'), cHIncome = cat(scopeH, 'Wages', 'income');
  const entry = (scope, category, kind, amount, desc, owner = ME) => ({ id: uuid(), scope_id: scope, category_id: category.id, owner_id: owner, client_id: 'e-' + uuid(), kind, amount_minor: amount, entry_date: d(0), show_on_today: false, today_lead_days: 2, description: desc, notes: '', allocation_status: 'planned', due_day: null, recurring_monthly: true, client_created_at: ms, client_updated_at: ms, cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso() });
  const listP = uuid(), listH = uuid();
  const li = (list, title, owner = ME, completed = false) => ({ id: uuid(), list_id: list, owner_id: owner, client_id: 'i-' + uuid(), title, notes: '', completed, sort_order: 0, client_created_at: ms, client_updated_at: ms, cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso() });
  return {
    profiles: [{ id: ME, display_name: 'Alex', created_at: nowIso(), updated_at: nowIso() }, { id: PARTNER, display_name: 'Sam', created_at: nowIso(), updated_at: nowIso() }],
    planly_households: [{ id: HH, name: 'Our Home', created_by: ME, created_at: nowIso(), updated_at: nowIso() }],
    planly_household_members: [{ household_id: HH, user_id: ME, role: 'owner', joined_at: nowIso(), display_name: null }, { household_id: HH, user_id: PARTNER, role: 'member', joined_at: nowIso(), display_name: null }],
    planly_household_invites: [],
    planly_preferences: [{ owner_id: ME, default_category: 'Personal', default_duration: 30, auto_complete_parent_subtasks: true, planning_start: '08:00:00', planning_end: '23:00:00', client_updated_at: ms, cloud_version: 1, created_at: nowIso(), updated_at: nowIso() }],
    planly_sync_state: [{ owner_id: ME, schema_version: 1, initial_migration_completed_at: nowIso(), migration_project_count: 4, migration_task_count: tasks.length, migration_digest: 'x', last_successful_sync_at: nowIso(), created_at: nowIso(), updated_at: nowIso() }, { owner_id: PARTNER, schema_version: 1, initial_migration_completed_at: nowIso(), migration_project_count: 0, migration_task_count: 1, migration_digest: 'y', last_successful_sync_at: nowIso(), created_at: nowIso(), updated_at: nowIso() }],
    planly_projects: [pRenov, pExam, pShared, pOld],
    planly_tasks: tasks,
    calendar_sources: [{ id: srcId, owner_id: ME, name: 'NHS Rota', source_type: 'ical', colour: '#E78AA7', is_read_only: true, show_today: true, show_month: true, show_timeline: true, enabled: true, last_synced_at: nowIso(), last_sync_status: 'ok', last_sync_error: null, created_at: nowIso(), updated_at: nowIso(), status: 'connected', error: null }],
    external_calendar_events: events,
    planly_budget_scopes: [
      { id: scopeP, owner_id: ME, household_id: null, scope_type: 'personal', name: 'Personal Budget', currency: 'GBP', client_id: 'sp', client_created_at: ms, client_updated_at: ms, cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso() },
      { id: scopeH, owner_id: ME, household_id: HH, scope_type: 'household', name: 'Household Budget', currency: 'GBP', client_id: 'sh', client_created_at: ms, client_updated_at: ms, cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso() }],
    planly_budget_categories: [cRent, cSalary, cBills, cHIncome],
    planly_budget_targets: [],
    planly_budget_entries: [entry(scopeP, cRent, 'expense', 95000, 'Rent'), entry(scopeP, cSalary, 'income', 250000, 'Salary'), entry(scopeH, cBills, 'expense', 12000, 'Electricity', PARTNER), entry(scopeH, cHIncome, 'income', 300000, 'Joint income')],
    planly_lists: [
      { id: listP, owner_id: ME, household_id: null, client_id: 'l-p', title: 'Personal errands', visibility: 'private', sort_order: 0, client_created_at: ms, client_updated_at: ms, cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso() },
      { id: listH, owner_id: PARTNER, household_id: HH, client_id: 'l-h', title: 'Shopping', visibility: 'household', sort_order: 1, client_created_at: ms, client_updated_at: ms, cloud_version: 1, deleted_at: null, created_at: nowIso(), updated_at: nowIso() }],
    planly_list_items: [li(listP, 'Post parcel'), li(listH, 'Milk', PARTNER), li(listH, 'Bread', PARTNER, true)],
  };
}
const PK = { planly_tasks: ['cloud_id'], planly_projects: ['cloud_id'], planly_preferences: ['owner_id'], planly_sync_state: ['owner_id'], planly_household_members: ['household_id', 'user_id'] };
const pk = t => PK[t] || ['id'];
const VERSIONED = new Set(['planly_tasks', 'planly_projects', 'planly_preferences', 'planly_budget_scopes', 'planly_budget_categories', 'planly_budget_targets', 'planly_budget_entries', 'planly_lists', 'planly_list_items']);
function parseVal(v) { if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false; return v; }
function cmp(a, b) { if (a == null && b == null) return 0; if (a == null) return -1; if (b == null) return 1; return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0; }
function matcher(params) {
  const fs = [];
  for (const [k, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    let neg = false, v = raw; if (v.startsWith('not.')) { neg = true; v = v.slice(4); }
    const dot = v.indexOf('.'), op = v.slice(0, dot), val = v.slice(dot + 1);
    let f;
    if (op === 'eq') f = r => String(r[k]) === val;
    else if (op === 'neq') f = r => String(r[k]) !== val;
    else if (op === 'is') f = r => (r[k] ?? null) === parseVal(val);
    else if (op === 'in') { const set = val.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')); f = r => set.includes(String(r[k])); }
    else if (op === 'gte') f = r => r[k] != null && String(r[k]) >= val;
    else if (op === 'gt') f = r => r[k] != null && String(r[k]) > val;
    else if (op === 'lte') f = r => r[k] != null && String(r[k]) <= val;
    else if (op === 'lt') f = r => r[k] != null && String(r[k]) < val;
    else { f = () => true; MOCK.unknown.push(`${k}=${raw}`); }
    fs.push(neg ? r => !f(r) : f);
  }
  return r => fs.every(f => f(r));
}
function visible(table, r, uid) {
  const hhOk = h => h && MOCK.db.planly_household_members.some(m => m.household_id === h && m.user_id === uid);
  switch (table) {
    case 'planly_tasks': return r.owner_id === uid || r.assignee_id === uid || (r.visibility === 'household' && hhOk(r.household_id));
    case 'planly_projects': return r.owner_id === uid || (r.visibility === 'household' && hhOk(r.household_id));
    case 'planly_lists': return r.owner_id === uid || (r.visibility === 'household' && hhOk(r.household_id));
    case 'planly_list_items': { const l = MOCK.db.planly_lists.find(x => x.id === r.list_id); return !!l && visible('planly_lists', l, uid); }
    case 'planly_budget_scopes': return r.owner_id === uid || (r.scope_type === 'household' && hhOk(r.household_id));
    case 'planly_budget_categories': case 'planly_budget_targets': case 'planly_budget_entries': { const s = MOCK.db.planly_budget_scopes.find(x => x.id === r.scope_id); return !!s && visible('planly_budget_scopes', s, uid); }
    case 'planly_households': return hhOk(r.id);
    case 'planly_household_members': return hhOk(r.household_id);
    case 'planly_household_invites': return MOCK.db.planly_household_members.some(m => m.household_id === r.household_id && m.user_id === uid && m.role === 'owner');
    case 'profiles': return true;
    default: return r.owner_id === undefined || r.owner_id === uid;
  }
}
function withDefaults(table, row) {
  if (table === 'planly_budget_entries') row = { show_on_today: false, today_lead_days: 2, ...row };
  const r = { ...row };
  if (pk(table)[0] === 'cloud_id' && !r.cloud_id) r.cloud_id = uuid();
  if (pk(table)[0] === 'id' && !r.id) r.id = uuid();
  if (VERSIONED.has(table)) r.cloud_version = r.cloud_version || 1;
  r.created_at = r.created_at || nowIso(); r.updated_at = nowIso();
  if (table === 'planly_tasks') { r.visibility ||= 'private'; r.subtasks ||= []; r.data ||= {}; r.duration_minutes ??= 30; r.priority ||= 'normal'; r.category ||= 'Personal'; r.recurrence ||= 'none'; r.reminder ||= 'none'; r.notes ??= ''; r.completed ??= false; r.pinned ??= false; r.deleted_at ??= null; }
  if (table === 'planly_projects') { r.visibility ||= 'private'; r.data ||= {}; r.notes ??= ''; r.archived ??= false; r.deleted_at ??= null; }
  if ('deleted_at' in r === false && VERSIONED.has(table)) r.deleted_at = null;
  return r;
}
function res(status, body, headers = {}) { return { status, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? '' : JSON.stringify(body) }; }
function err(status, code, message) { MOCK.errors.push({ status, code, message }); return res(status, { code, message, details: null, hint: null }); }
export const MOCK = { db: seed(), log: [], bodies: [], unknown: [], errors: [], uid: ME, failNext: null };
export function reset() { MOCK.db = seed(); MOCK.log = []; MOCK.unknown = []; MOCK.errors = []; }
export function handle(method, url, headers, bodyText) {
  const u = new URL(url), path = u.pathname;
  const auth = headers['authorization'] || '';
  let uid = MOCK.uid;
  try { uid = JSON.parse(Buffer.from(auth.split('.')[1] || '', 'base64url').toString()).sub || MOCK.uid; } catch { }
  MOCK.log.push(`${method} ${path}${u.search}`.slice(0, 200)); if (method !== 'GET' && !path.includes('sync_state')) MOCK.bodies.push({ method, path: path + u.search, body: (bodyText || '').slice(0, 1500) });
  if (path.startsWith('/auth/v1/')) {
    if (path === '/auth/v1/user') return res(200, session(uid).user);
    if (path === '/auth/v1/token') return res(200, session(uid));
    if (path === '/auth/v1/logout') return { status: 204, headers: {}, body: '' };
    return res(200, {});
  }
  if (path.startsWith('/functions/v1/')) return res(200, { ok: true });
  if (path.startsWith('/rest/v1/rpc/')) {
    const fn = path.split('/').pop(); const args = bodyText ? JSON.parse(bodyText) : {};
    if (fn === 'planly_set_assigned_task_completed') { const t = MOCK.db.planly_tasks.find(x => x.owner_id === args.p_owner_id && x.client_id === args.p_client_id && x.assignee_id === uid); if (!t) return err(400, 'P0001', 'Task not assigned to you'); t.completed = !!args.p_completed; t.cloud_version++; t.updated_at = nowIso(); return res(200, t); }
    if (fn === 'planly_set_household_display_name') {
      const b = JSON.parse(bodyText || '{}'); MOCK.nameCalls = (MOCK.nameCalls || 0) + 1;
      const raw = String(b.p_display_name ?? ''); const v = raw.replace(/\s+/g, ' ').trim() || null;
      if (v && /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/.test(v)) return err(400, '22023', 'Display name contains unsupported characters');
      if (v && [...v].length > 20) return err(400, '22001', 'Display name must be 20 characters or fewer');
      const m = MOCK.db.planly_household_members.find(x => x.user_id === uid); if (!m) return err(400, '42501', 'Household membership required');
      m.display_name = v; return res(200, { ...m });
    }
    if (fn === 'planly_set_household_task_completed') {
      MOCK.rpcCalls = MOCK.rpcCalls || []; MOCK.rpcCalls.push({ uid, ...args });
      if (MOCK.forceRpcError) { const e = MOCK.forceRpcError; MOCK.forceRpcError = null; return err(400, e.code, e.message); }
      const t = MOCK.db.planly_tasks.find(x => x.owner_id === args.p_owner_id && x.client_id === args.p_client_id && !x.deleted_at && x.visibility === 'household' && x.household_id);
      if (!t) return err(400, 'P0002', 'Task not found');
      if (!MOCK.db.planly_household_members.some(m => m.household_id === t.household_id && m.user_id === uid)) return err(400, '42501', 'Not authorized');
      if (uid !== t.owner_id && t.assignee_id && t.assignee_id !== uid) return err(400, '42501', 'Task is assigned to another household member');
      if (t.completed === !!args.p_completed) return res(200, t);
      if (Number(t.cloud_version) !== Number(args.p_expected_cloud_version)) return err(400, 'P0409', 'Task changed elsewhere');
      t.completed = !!args.p_completed; t.completed_by = t.completed ? uid : null; t.completed_at = t.completed ? nowIso() : null; t.cloud_version++; t.data = { ...t.data, completed: t.completed };
      if (t.completed && args.p_next_date) { const series = t.series_client_id || t.client_id; t.series_client_id = series; if (!MOCK.db.planly_tasks.some(x => x.owner_id === t.owner_id && x.series_client_id === series && x.task_date === args.p_next_date && !x.deleted_at)) { const cid = Date.now() + '-srv' + Math.random().toString(16).slice(2, 8); MOCK.db.planly_tasks.push({ ...t, cloud_id: uuid(), client_id: cid, task_date: args.p_next_date, completed: false, completed_by: null, completed_at: null, occurrence_number: (t.occurrence_number || 1) + 1, cloud_version: 1, data: { ...t.data, id: cid, date: args.p_next_date, completed: false, seriesId: series, occurrenceNumber: (t.occurrence_number || 1) + 1 } }); } }
      return res(200, t);
    }
    if (fn === 'planly_create_household_invite') { const inv = { id: uuid(), household_id: args.p_household_id, invited_email: args.p_email, invited_by: uid, token_hash: 'h', status: 'pending', expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), created_at: nowIso(), accepted_by: null, accepted_at: null }; MOCK.db.planly_household_invites.push(inv); return res(200, JSON.stringify('a'.repeat(64)).slice(1,-1) && 'a'.repeat(64)); }
    if (fn === 'planly_revoke_household_invite') { const i = MOCK.db.planly_household_invites.find(x => x.id === args.p_invite_id); if (i) i.status = 'revoked'; return res(200, true); }
    return res(200, null);
  }
  const table = path.replace('/rest/v1/', '');
  const rows = MOCK.db[table];
  if (!rows) return err(404, '42P01', `relation "public.${table}" does not exist`);
  if (MOCK.failNext && MOCK.failNext.table === table && MOCK.failNext.method === method) { const f = MOCK.failNext; MOCK.failNext = null; return err(f.status || 400, f.code, f.message); }
  const params = [...u.searchParams.entries()], m = matcher(params);
  const accept = headers['accept'] || '', prefer = headers['prefer'] || '';
  const single = accept.includes('vnd.pgrst.object');
  const wantRep = prefer.includes('return=representation');
  const selParam = u.searchParams.get('select');
  if (method === 'GET' && selParam && selParam !== '*' && rows.length) { const known = new Set(Object.keys(rows[0])); const bad = selParam.split(',').map(c => c.trim()).filter(c => c && !c.includes('(') && !known.has(c)); if (bad.length) { MOCK.errors.push(`42703 ${table}.${bad[0]}`); return err(400, '42703', `column ${table}.${bad[0]} does not exist`); } }
  const project = r => { if (!selParam || selParam === '*' || !r || typeof r !== 'object') return r; const cols = selParam.split(',').map(c => c.trim()).filter(c => c && !c.includes('(')); if (!cols.length) return r; const o = {}; for (const c of cols) if (c in r) o[c] = r[c]; return o; };
  const finish = (list0, status = 200) => { const list = Array.isArray(list0) ? list0.map(project) : list0;
    if (single) { if (list.length === 1) return res(status, list[0]); return err(406, 'PGRST116', `JSON object requested, multiple (or no) rows returned (${list.length})`); }
    return res(status, list, { 'content-range': `0-${Math.max(0, list.length - 1)}/*` });
  };
  if (method === 'GET' || method === 'HEAD') {
    let out = rows.filter(r => visible(table, r, uid)).filter(m);
    const order = u.searchParams.get('order');
    if (order) { const parts = order.split(',').map(p => p.split('.')); out = out.slice().sort((a, b) => { for (const [c, dir] of parts) { const x = cmp(a[c], b[c]); if (x) return dir === 'desc' ? -x : x; } return 0; }); }
    const lim = u.searchParams.get('limit'); if (lim) out = out.slice(0, Number(lim));
    return finish(out.map(r => ({ ...r })));
  }
  if (method === 'POST') {
    const body = JSON.parse(bodyText || '[]'), list = Array.isArray(body) ? body : [body];
    const upsert = prefer.includes('resolution=merge-duplicates') || prefer.includes('resolution=ignore-duplicates');
    const conflict = (u.searchParams.get('on_conflict') || pk(table).join(',')).split(',');
    const out = [];
    for (const raw of list) {
      if (MOCK.fail503Table === table) return err(503, 'PGRST000', 'Service unavailable');
      if (MOCK.rejectTable === table) return err(403, '42501', `new row violates row-level security policy for table "${table}"`);
      const _hhCatOk = table === 'planly_budget_categories' && (() => { const sc = MOCK.db.planly_budget_scopes.find(x => x.id === raw.scope_id); return !!sc && sc.scope_type === 'household' && raw.owner_id === sc.owner_id && MOCK.db.planly_household_members.some(m => m.household_id === sc.household_id && m.user_id === uid) })();
      if ('owner_id' in raw && raw.owner_id !== uid && !_hhCatOk && !['planly_household_members'].includes(table)) return err(403, '42501', `new row violates row-level security policy for table "${table}"`);
      const existing = rows.find(r => conflict.every(c => raw[c] !== undefined && String(r[c]) === String(raw[c])));
      if (existing && upsert) { Object.assign(existing, raw, { updated_at: nowIso() }); if (VERSIONED.has(table)) existing.cloud_version++; out.push({ ...existing }); continue; }
      if (existing) return err(409, '23505', `duplicate key value violates unique constraint "${table}_pkey"`);
      const r = withDefaults(table, raw); rows.push(r); out.push({ ...r });
    }
    return wantRep ? finish(out, 201) : { status: 201, headers: {}, body: '' };
  }
  if (method === 'PATCH') {
    const patch = JSON.parse(bodyText || '{}');
    const hit = rows.filter(r => visible(table, r, uid)).filter(m);
    for (const r of hit) {
      if (table === 'planly_lists' && (('visibility' in patch && patch.visibility !== r.visibility) || ('household_id' in patch && patch.household_id !== r.household_id))) return err(400, 'P0001', 'List identity and sharing scope are immutable');
      if (table === 'planly_tasks' && r.owner_id !== uid) return wantRep ? finish([]) : { status: 204, headers: {}, body: '' };
      const wasCompleted=!!r.completed,oldBy=r.completed_by??null,oldAt=r.completed_at??null; Object.assign(r, patch, { updated_at: nowIso() }); if (table==='planly_tasks'){ if(!!r.completed!==wasCompleted){ r.completed_by=r.completed?uid:null; r.completed_at=r.completed?nowIso():null } else { r.completed_by=oldBy; r.completed_at=oldAt } } if (VERSIONED.has(table)) r.cloud_version = Number(r.cloud_version || 1) + 1;
    }
    return wantRep ? finish(hit.map(r => ({ ...r }))) : { status: 204, headers: {}, body: '' };
  }
  if (method === 'DELETE') {
    const noDelete = ['planly_tasks', 'planly_projects', 'planly_budget_entries', 'planly_budget_categories', 'planly_budget_scopes', 'planly_budget_targets', 'planly_preferences'];
    if (noDelete.includes(table)) return err(403, '42501', `permission denied for table ${table}`); // mirrors prod: no DELETE grant
    const hit = rows.filter(r => visible(table, r, uid)).filter(m);
    MOCK.db[table] = rows.filter(r => !hit.includes(r));
    return wantRep ? finish(hit) : { status: 204, headers: {}, body: '' };
  }
  return err(405, 'PGRST', 'method not allowed');
}
