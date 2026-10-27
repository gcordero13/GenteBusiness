import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTareasVisibles } from "./proyectos/actions";
import { ProyectosWorkspace } from "./proyectos/ProyectosWorkspace";
import { NuevoProyectoDialog } from "./proyectos/NuevoProyectoDialog";

export default async function PlanificacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tasks = await listTareasVisibles();
  const misTareas = tasks.filter((t) => t.relationship === "mio" || t.relationship === "asignado");
  const compartidoConmigo = tasks.filter((t) => t.relationship === "compartido");

  // Mixed-project Tablero columns: different projects have unrelated
  // estado catalogs, so columns here are deduped by estado NAME (not id)
  // rather than one project's real plan_estados - and dragging is
  // disabled (no onDropEstado passed), since there's no single estado_id
  // a dropped card could resolve to across projects. The project detail
  // screen (next task) is where the real, per-project, draggable board lives.
  function buildMixedColumns(list: typeof tasks) {
    const names = new Map<string, string>();
    for (const t of list) {
      const key = t.estadoName ?? "sin-estado";
      names.set(key, t.estadoName ?? "Sin estado");
    }
    return Array.from(names.entries()).map(([key, label]) => ({ key, label, color: null }));
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-8 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Planificación</h1>
            <p className="text-sm text-muted-foreground">Tus proyectos y tareas.</p>
          </div>
          <NuevoProyectoDialog />
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Mis tareas</h2>
          <ProyectosWorkspace
            tasks={misTareas}
            columns={buildMixedColumns(misTareas)}
            columnKeyBy="estadoName"
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Compartido conmigo</h2>
          <ProyectosWorkspace
            tasks={compartidoConmigo}
            columns={buildMixedColumns(compartidoConmigo)}
            columnKeyBy="estadoName"
          />
        </section>
      </div>
    </div>
  );
}
