-- Auto-rollup of a parent task's percent_complete from its direct
-- sub-tasks' average, bubbling up an unlimited-depth parent_task_id chain.
-- A task is a "parent" simply by having >=1 row with parent_task_id
-- pointing at it - there is no separate flag. Leaf tasks (no children) are
-- untouched by this mechanism; their percent_complete stays user-editable
-- (enforced in app code, not here).
--
-- plan_recompute_percent_chain walks UP from a given task id (the parent of
-- whatever row just changed) using an explicit while loop, not recursive
-- trigger firing - this keeps a single, bounded statement in control of the
-- whole walk instead of relying on Postgres re-firing AFTER triggers on
-- each UPDATE it issues. A 1000-iteration cap is a second, independent
-- belt-and-suspenders safeguard against any future bug that could make a
-- task its own ancestor (the existing plan_set_tarea_ancestor_ids trigger
-- should already make that impossible).
create or replace function public.plan_recompute_percent_chain(start_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_id uuid := start_id;
  current_row public.plan_tareas%rowtype;
  avg_percent integer;
  completado_id uuid;
  iterations integer := 0;
begin
  while current_id is not null and iterations < 1000 loop
    iterations := iterations + 1;

    select * into current_row from public.plan_tareas where id = current_id;
    if not found then
      exit;
    end if;

    select round(avg(percent_complete)) into avg_percent
    from public.plan_tareas
    where parent_task_id = current_id;

    -- No children left (e.g. the last sub-task was just deleted) - this
    -- task is a leaf again. Its percent_complete goes back to being
    -- user-owned, so it's left untouched at whatever it last computed to,
    -- and the walk stops here (nothing about this ancestor changed, so
    -- nothing further up needs recomputing either).
    if avg_percent is null then
      exit;
    end if;

    if avg_percent >= 100 then
      select id into completado_id
      from public.plan_estados
      where proyecto_id = current_row.proyecto_id and kind = 'completado'
      limit 1;

      update public.plan_tareas
      set percent_complete = avg_percent,
          estado_id = coalesce(completado_id, estado_id)
      where id = current_id;
    else
      update public.plan_tareas
      set percent_complete = avg_percent
      where id = current_id;
    end if;

    current_id := current_row.parent_task_id;
  end loop;

  if iterations >= 1000 then
    raise warning 'plan_recompute_percent_chain: hit 1000-iteration cap starting from %', start_id;
  end if;
end;
$$;

-- plan_recompute_percent_chain is trigger-internal plumbing only - it has
-- no auth.uid()/plan_can_edit_tarea check of its own (unlike submit_complaint,
-- the codebase's other SECURITY DEFINER function meant for direct calls),
-- so it must never be directly callable. CREATE FUNCTION grants EXECUTE to
-- PUBLIC by default; without this revoke, any authenticated (or anon) role
-- could call it on an arbitrary task id and force percent_complete/estado_id
-- writes across that task's whole ancestor chain, bypassing plan_tareas RLS
-- entirely (the same class of bug fixed for other functions in
-- 20261027090000_plan_proyectos_security_hardening.sql). The trigger
-- function that calls it is SECURITY DEFINER, so its owner-level EXECUTE
-- right is unaffected by this revoke.
revoke execute on function public.plan_recompute_percent_chain(uuid) from public;

-- Fires on any write that can change what a parent's average should be:
-- a child's percent_complete changing, a task being re-parented (either
-- end of the move needs recomputing), a new child being inserted, or a
-- child being deleted. pg_trigger_depth() > 1 means this invocation was
-- caused by plan_recompute_percent_chain's own UPDATE statements (issued
-- from inside this same trigger's call), not by an external write - without
-- this guard, each ancestor update would re-fire this trigger and walk the
-- same chain again from a different starting point, doing redundant work
-- (the chain function already walks the full chain in one call, so no
-- correctness is lost by skipping these re-entrant firings).
create or replace function public.plan_recompute_ancestor_percent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op = 'DELETE' then
    if old.parent_task_id is not null then
      perform public.plan_recompute_percent_chain(old.parent_task_id);
    end if;
    return old;
  end if;

  if new.parent_task_id is not null then
    perform public.plan_recompute_percent_chain(new.parent_task_id);
  end if;

  if tg_op = 'UPDATE'
     and old.parent_task_id is distinct from new.parent_task_id
     and old.parent_task_id is not null then
    -- Re-parented (or detached) - the OLD parent lost a child and must
    -- also be recomputed.
    perform public.plan_recompute_percent_chain(old.parent_task_id);
  end if;

  return new;
end;
$$;

create trigger plan_tareas_recompute_ancestor_percent
  after insert or delete or update of percent_complete, parent_task_id on public.plan_tareas
  for each row
  execute function public.plan_recompute_ancestor_percent();
