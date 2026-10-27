import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCompartidoConmigo, listMisProyectos, listTareasVisibles } from "./proyectos/actions";
import { NuevoProyectoDialog } from "./proyectos/NuevoProyectoDialog";
import { TareasTabs } from "./proyectos/TareasTabs";
import type { ProyectoListRow } from "./proyectos/actions";

function ProyectoCard({ proyecto }: { proyecto: ProyectoListRow }) {
  return (
    <Link
      href={`/planificacion/proyectos/${proyecto.id}`}
      className="block rounded-xl border p-3 text-sm transition-colors hover:border-[#04B1AF] hover:bg-[#04B1AF]/5"
    >
      <p className="font-semibold text-foreground">{proyecto.name}</p>
      {proyecto.description && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{proyecto.description}</p>
      )}
    </Link>
  );
}

export default async function PlanificacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [tasks, misProyectos, proyectosCompartidos] = await Promise.all([
    listTareasVisibles(),
    listMisProyectos(),
    listCompartidoConmigo(),
  ]);
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
          <h2 className="text-lg font-semibold text-foreground">Mis proyectos</h2>
          {misProyectos.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {misProyectos.map((p) => (
                <ProyectoCard key={p.id} proyecto={p} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              Todavía no has creado ningún proyecto.
            </p>
          )}
        </section>

        {proyectosCompartidos.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Proyectos compartidos conmigo</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {proyectosCompartidos.map((p) => (
                <ProyectoCard key={p.id} proyecto={p} />
              ))}
            </div>
          </section>
        )}

        <TareasTabs
          misTareas={misTareas}
          misColumns={buildMixedColumns(misTareas)}
          compartidoConmigo={compartidoConmigo}
          compartidoColumns={buildMixedColumns(compartidoConmigo)}
          estados={[]}
          assignees={[]}
        />
      </div>
    </div>
  );
}
