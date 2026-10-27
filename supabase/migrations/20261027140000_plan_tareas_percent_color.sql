-- plan_tareas gains percent_complete (user-editable 0-100 for leaf tasks,
-- computed/read-only for tasks with sub-tasks - enforced in app code and a
-- later trigger, not here) and color (a free-standing per-task color tag,
-- independent of estado_id).
alter table public.plan_tareas
  add column percent_complete integer not null default 0
    check (percent_complete between 0 and 100),
  add column color text;

-- Re-issue the C3 column-level UPDATE grant (20261027090000) to include the
-- two new columns. Postgres has no "add column to an existing grant" verb,
-- so the full allowlist is revoked and re-granted with percent_complete and
-- color appended.
revoke update on public.plan_tareas from authenticated;
grant update (
  title,
  description,
  estado_id,
  priority,
  labels,
  start_date,
  due_date,
  assignee_id,
  ciclo_id,
  sort_order,
  percent_complete,
  color
) on public.plan_tareas to authenticated;
