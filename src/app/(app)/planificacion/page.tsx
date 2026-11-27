import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  listAssignableUsers,
  listCompartidoConmigo,
  listMisProyectos,
  listTareasConAsigneeInactivo,
  listTareasVisibles,
} from "./proyectos/actions";
import { NuevoProyectoDialog } from "./proyectos/NuevoProyectoDialog";
import { TareasTabs } from "./proyectos/TareasTabs";
import { EstadoPill, FechaLimiteText, PrioridadBadge } from "./proyectos/Distintivos";
import { esCerrada, estaVencida, hoyISO, resumenTareas, type ResumenTareas } from "./proyectos/visual";

export default async function PlanificacionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [tasks, misProyectos, proyectosCompartidos, tareasSinResponsableActivo, assignableUsers] = await Promise.all([
    listTareasVisibles(),
    listMisProyectos(),
    listCompartidoConmigo(),
    listTareasConAsigneeInactivo(),
    listAssignableUsers(),
  ]);
  // Confirmed with the user: "Mis tareas" is specifically what's assigned
  // to me (relationship "asignado"); tasks I created myself show instead
  // inside "Mis proyectos", alongside the project list they belong to.
  const misTareasCreadas = tasks.filter((t) => t.relationship === "mio");
  const misTareas = tasks.filter((t) => t.relationship === "asignado");
  const compartidoConmigo = tasks.filter((t) => t.relationship === "compartido");

  const hoy = hoyISO();
  const abierta = (t: (typeof tasks)[number]) => !esCerrada(t.estadoKind) && t.percentComplete < 100;

  // Each project card's numbers, from whichever of its tasks are visible to
  // me (RLS may hide some on a project I'm only partially shared into - the
  // best approximation available without an extra privileged query). A
  // plain object, not a Map: it crosses the RSC boundary as serialized data.
  const tasksByProyecto = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!tasksByProyecto.has(t.proyectoId)) tasksByProyecto.set(t.proyectoId, []);
    tasksByProyecto.get(t.proyectoId)!.push(t);
  }
  const resumenByProyecto: Record<string, ResumenTareas> = Object.fromEntries(
    [...tasksByProyecto.entries()].map(([proyectoId, list]) => [proyectoId, resumenTareas(list, hoy)]),
  );

  const abiertas = tasks.filter(abierta);
  const kpis = [
    { label: "Proyectos activos", value: misProyectos.length + proyectosCompartidos.length, hint: `${proyectosCompartidos.length} compartidos contigo` },
    { label: "Tareas abiertas", value: abiertas.length, hint: `${abiertas.filter((t) => t.assigneeId === user.id).length} asignadas a ti` },
    { label: "Vencidas", value: tasks.filter((t) => estaVencida(t, hoy)).length, hint: "Revisa sus fechas límite", tone: "vencidas" as const },
    { label: "Completadas", value: tasks.filter((t) => !abierta(t) && t.estadoKind !== "cancelado").length, hint: `de ${tasks.length} tareas visibles`, tone: "ok" as const },
  ];

  // What needs me now: my open tasks (assigned to me, or mine without a
  // responsible) that are overdue or due within 2 days, soonest first.
  const enDosDias = new Date(`${hoy}T12:00:00Z`);
  enDosDias.setUTCDate(enDosDias.getUTCDate() + 2);
  const limite = enDosDias.toISOString().slice(0, 10);
  const atencion = tasks
    .filter((t) => abierta(t) && t.dueDate && t.dueDate <= limite)
    .filter((t) => t.assigneeId === user.id || (t.createdBy === user.id && !t.assigneeId))
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 6);

  // Mixed-project Tablero columns: different projects have unrelated
  // estado catalogs, so columns here are deduped by estado NAME (not id)
  // rather than one project's real plan_estados - and dragging is
  // disabled (no onDropEstado passed), since there's no single estado_id
  // a dropped card could resolve to across projects. The project detail
  // screen is where the real, per-project, draggable board lives.
  function buildMixedColumns(list: typeof tasks) {
    const names = new Map<string, { label: string; color: string | null }>();
    for (const t of list) {
      const key = t.estadoName ?? "sin-estado";
      if (!names.has(key)) names.set(key, { label: t.estadoName ?? "Sin estado", color: t.estadoColor });
    }
    return Array.from(names.entries()).map(([key, v]) => ({ key, label: v.label, color: v.color }));
  }

  return (
    <div className="w-full min-w-0 space-y-7 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">
            Inicio <span aria-hidden="true">/</span> <span className="font-medium text-foreground">Proyectos</span>
          </p>
          <h1 className="text-[28px] font-bold tracking-tight text-[#0B2545] sm:text-3xl dark:text-foreground">Proyectos</h1>
          <p className="text-[15px] text-muted-foreground">Tus proyectos, tareas y lo que necesita atención hoy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/planificacion/departamentos">
            <Button variant="outline" className="gap-2">
              <Building2 className="size-4" />
              Departamentos
            </Button>
          </Link>
          <NuevoProyectoDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-1 rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
            <span className="text-sm font-medium text-muted-foreground">{k.label}</span>
            <span
              className={`text-3xl font-bold tracking-tight tabular-nums ${
                k.tone === "vencidas" && k.value > 0
                  ? "text-red-700 dark:text-red-400"
                  : k.tone === "ok"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-[#0B2545] dark:text-foreground"
              }`}
            >
              {k.value}
            </span>
            <span className="text-xs text-muted-foreground">{k.hint}</span>
          </div>
        ))}
      </div>


      <TareasTabs
        misProyectos={misProyectos}
        proyectosCompartidos={proyectosCompartidos}
        resumenByProyecto={resumenByProyecto}
        misTareasCreadas={misTareasCreadas}
        misTareasCreadasColumns={buildMixedColumns(misTareasCreadas)}
        misTareas={misTareas}
        misColumns={buildMixedColumns(misTareas)}
        compartidoConmigo={compartidoConmigo}
        compartidoColumns={buildMixedColumns(compartidoConmigo)}
        tareasSinResponsableActivo={tareasSinResponsableActivo}
        tareasSinResponsableActivoColumns={buildMixedColumns(tareasSinResponsableActivo)}
        estados={[]}
        assignees={assignableUsers}
      />

      {/* At the bottom (user request, 2026-11-27): the tabs and "Tareas que he
          creado" come first, right under the numbers. */}
      <section aria-labelledby="atencion-title" className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
          <h2 id="atencion-title" className="text-base font-semibold text-[#0B2545] dark:text-foreground">
            Necesitan tu atención
          </h2>
          <span className="text-sm text-muted-foreground">Vencidas o por vencer en 2 días</span>
        </div>
        {atencion.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground sm:px-5">
            <CircleCheck className="size-4 text-emerald-600" />
            Nada urgente por ahora. ¡Vas al día!
          </p>
        ) : (
          <ul>
            {atencion.map((t) => (
              <li key={t.id} className="border-b last:border-0">
                <Link
                  href={`/planificacion/proyectos/${t.proyectoId}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_6rem_9rem] sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{t.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t.proyectoName}</span>
                  </span>
                  <span className="hidden sm:block">
                    <EstadoPill name={t.estadoName} color={t.estadoColor} />
                  </span>
                  <span className="hidden sm:block">
                    <PrioridadBadge priority={t.priority} />
                  </span>
                  <FechaLimiteText dueDate={t.dueDate} hoy={hoy} cerrada={false} className="justify-self-end sm:justify-self-start" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
