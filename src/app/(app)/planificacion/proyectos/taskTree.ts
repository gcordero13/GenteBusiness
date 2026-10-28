// Plain module, no "use server"/"use client" - actions.ts has "use server"
// at the top, which requires every one of its exports to be an async
// Server Action, so this pure synchronous helper can't live there.
import type { TareaListRow } from "./actions";

// Sub-tasks don't carry their own planificacion_id - they belong to one by
// inheriting it from their root ancestor. Given a project's full task list
// (already fetched, e.g. via listTareasDeProyecto), this pulls out a
// planificación's root tasks plus every level of their descendants, pure
// in-memory filtering rather than a second round trip or more complex SQL.
export function tasksUnderPlanificacion(allTasks: TareaListRow[], planificacionId: string): TareaListRow[] {
  const byParent = new Map<string, TareaListRow[]>();
  for (const t of allTasks) {
    if (!t.parentTaskId) continue;
    if (!byParent.has(t.parentTaskId)) byParent.set(t.parentTaskId, []);
    byParent.get(t.parentTaskId)!.push(t);
  }
  const roots = allTasks.filter((t) => t.planificacionId === planificacionId);
  const result: TareaListRow[] = [];
  const stack = [...roots];
  while (stack.length > 0) {
    const t = stack.pop()!;
    result.push(t);
    stack.push(...(byParent.get(t.id) ?? []));
  }
  return result;
}
