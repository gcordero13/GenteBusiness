"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderPlus, Search, TriangleAlert } from "lucide-react";
import type { EstadoOption, ProyectoListRow, TareaListRow } from "./actions";
import { ProyectosWorkspace } from "./ProyectosWorkspace";
import type { TableroColumn } from "./TableroView";
import type { AssigneeOption } from "./TareaCreateDialog";
import { BarraAvance, PersonaAvatar } from "./Distintivos";
import { colorDe, iniciales, SALUD_TONE_CLASS, saludProyecto, type ResumenTareas } from "./visual";

type TareasTab = "proyectos" | "mias" | "compartidas";

/** Top-level tasks of a list (sub-tasks are counted inside their parent). */
const raices = (list: TareaListRow[]) => list.filter((t) => !t.parentTaskId).length;

/** A project at a glance (approved redesign): color, area, health, progress, workload and team. */
function ProyectoCard({ proyecto, resumen }: { proyecto: ProyectoListRow; resumen?: ResumenTareas }) {
  const color = colorDe(proyecto.id);
  const salud = resumen && resumen.tareas > 0 ? saludProyecto(resumen.vencidas) : null;
  const personas = resumen?.personas.slice(0, 3) ?? [];
  return (
    <Link
      href={`/planificacion/proyectos/${proyecto.id}`}
      className="group flex flex-col gap-3.5 rounded-2xl border bg-card p-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#04B1AF]/60 hover:shadow-md sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {iniciales(proyecto.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[#0B2545] group-hover:text-[#036E6C] dark:text-foreground dark:group-hover:text-[#5FD6D4]">
            {proyecto.name}
          </p>
          <p className="truncate text-sm text-muted-foreground">{proyecto.departamentoName ?? "Sin departamento"}</p>
        </div>
        {salud && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${SALUD_TONE_CLASS[salud.tone]}`}>
            {salud.label}
          </span>
        )}
      </div>
      {proyecto.description && <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{proyecto.description}</p>}
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Avance</span>
          <span className="font-semibold tabular-nums">{resumen?.percent ?? 0}%</span>
        </div>
        <BarraAvance percent={resumen?.percent ?? 0} showLabel={false} color={color} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
        <span className="flex gap-3 text-sm">
          <span className="text-muted-foreground">
            {resumen?.tareas ?? 0} {resumen?.tareas === 1 ? "tarea" : "tareas"}
          </span>
          {resumen && resumen.tareas > 0 && (
            <span
              className={
                resumen.vencidas > 0 ? "font-semibold text-red-700 dark:text-red-400" : "font-semibold text-emerald-700 dark:text-emerald-400"
              }
            >
              {resumen.vencidas > 0 ? `${resumen.vencidas} ${resumen.vencidas === 1 ? "vencida" : "vencidas"}` : "Al día"}
            </span>
          )}
        </span>
        {personas.length > 0 && (
          <span className="flex -space-x-2">
            {personas.map((p) => (
              <PersonaAvatar key={p.name} name={p.name} photoUrl={p.photoUrl} className="ring-2 ring-card" />
            ))}
          </span>
        )}
      </div>
    </Link>
  );
}

function ProyectosGrid({ proyectos, resumenByProyecto }: { proyectos: ProyectoListRow[]; resumenByProyecto: Record<string, ResumenTareas> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {proyectos.map((p) => (
        <ProyectoCard key={p.id} proyecto={p} resumen={resumenByProyecto[p.id]} />
      ))}
    </div>
  );
}

// Landing-page sections ("Mis proyectos" / "Mis tareas" / "Compartido
// conmigo") shown one at a time behind a tab switcher instead of stacked,
// so the page doesn't render everything at once - confirmed with the user
// ("quiero... tener todo en una sola hoja... optimizar espacio").
export function TareasTabs({
  misProyectos,
  proyectosCompartidos,
  resumenByProyecto,
  misTareasCreadas,
  misTareasCreadasColumns,
  misTareas,
  misColumns,
  compartidoConmigo,
  compartidoColumns,
  tareasSinResponsableActivo,
  tareasSinResponsableActivoColumns,
  estados,
  assignees,
}: {
  misProyectos: ProyectoListRow[];
  proyectosCompartidos: ProyectoListRow[];
  resumenByProyecto: Record<string, ResumenTareas>;
  misTareasCreadas: TareaListRow[];
  misTareasCreadasColumns: TableroColumn[];
  misTareas: TareaListRow[];
  misColumns: TableroColumn[];
  compartidoConmigo: TareaListRow[];
  compartidoColumns: TableroColumn[];
  tareasSinResponsableActivo: TareaListRow[];
  tareasSinResponsableActivoColumns: TableroColumn[];
  estados: EstadoOption[];
  assignees: AssigneeOption[];
}) {
  const [tab, setTab] = useState<TareasTab>("proyectos");
  const [query, setQuery] = useState("");
  // Opens on the tasks assigned to me, unless I only have ones I created.
  const [vistaMias, setVistaMias] = useState<"asignadas" | "creadas">(
    misTareas.length === 0 && misTareasCreadas.length > 0 ? "creadas" : "asignadas",
  );

  const filtrar = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list: ProyectoListRow[]) =>
      q ? list.filter((p) => `${p.name} ${p.description ?? ""} ${p.departamentoName ?? ""}`.toLowerCase().includes(q)) : list;
  }, [query]);
  const mios = filtrar(misProyectos);
  const compartidos = filtrar(proyectosCompartidos);

  const tabs: { key: TareasTab; label: string; count: number }[] = [
    { key: "proyectos", label: "Mis proyectos", count: misProyectos.length },
    { key: "mias", label: "Mis tareas", count: raices(misTareas) + raices(misTareasCreadas) },
    { key: "compartidas", label: "Compartido conmigo", count: proyectosCompartidos.length + raices(compartidoConmigo) },
  ];
  const selectorMias = (
    <div role="tablist" aria-label="Mis tareas" className="flex gap-1 rounded-xl border bg-card p-1 shadow-xs">
      {(
        [
          { key: "asignadas", label: "Asignadas a mí", count: raices(misTareas) },
          { key: "creadas", label: "Creadas por mí", count: raices(misTareasCreadas) },
        ] as const
      ).map((v) => (
        <button
          key={v.key}
          type="button"
          role="tab"
          aria-selected={vistaMias === v.key}
          onClick={() => setVistaMias(v.key)}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            vistaMias === v.key
              ? "bg-[#0B2545] font-semibold text-white dark:bg-[#04B1AF]/25 dark:text-[#7FE3E1]"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {v.label}
          <span
            className={`rounded-full px-1.5 text-xs font-semibold tabular-nums ${
              vistaMias === v.key ? "bg-white/20 text-white dark:text-[#7FE3E1]" : "bg-muted text-muted-foreground"
            }`}
          >
            {v.count}
          </span>
        </button>
      ))}
    </div>
  );
  const mostrarBuscador =
    (tab === "proyectos" && misProyectos.length > 0) || (tab === "compartidas" && proyectosCompartidos.length > 0);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b">
        <div role="tablist" aria-label="Secciones" className="-mb-px flex gap-5 overflow-x-auto sm:gap-7">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-2 border-b-2 pt-1 pb-3 text-[15px] transition-colors ${
                tab === t.key
                  ? "border-[#04B1AF] font-semibold text-[#0B2545] dark:text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  tab === t.key ? "bg-[#04B1AF]/15 text-[#036E6C] dark:text-[#5FD6D4]" : "bg-muted text-muted-foreground"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        {mostrarBuscador && (
          <label className="mb-2.5 flex h-10 w-full items-center gap-2 rounded-xl border bg-card px-3 text-muted-foreground shadow-xs focus-within:ring-3 focus-within:ring-ring/50 sm:w-72">
            <Search className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyecto…"
              aria-label="Buscar proyecto"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
      </div>

      {/* Only the projects I created (user request, 2026-11-27); projects
          shared with me live in "Compartido conmigo". */}
      {tab === "proyectos" &&
        (misProyectos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
            <FolderPlus className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Todavía no has creado proyectos</p>
            <p className="text-sm text-muted-foreground">Crea uno con «Nuevo proyecto».</p>
          </div>
        ) : mios.length > 0 ? (
          <ProyectosGrid proyectos={mios} resumenByProyecto={resumenByProyecto} />
        ) : (
          <p className="text-sm text-muted-foreground">Ningún proyecto coincide con «{query}».</p>
        ))}
      {/* "Mis tareas" holds both the tasks assigned to me and the ones I
          created, each in its own tab (user request, 2026-11-27: "Tareas
          que he creado" belongs here, not under "Mis proyectos"). */}
      {tab === "mias" && (
        <div className="space-y-6">
          {/* The Asignadas/Creadas switch sits on the same row as Lista,
              Tablero… (user request, 2026-11-27: fewer rows). */}
          {vistaMias === "asignadas" ? (
            <ProyectosWorkspace
              key="asignadas"
              tasks={misTareas}
              columns={misColumns}
              columnKeyBy="estadoName"
              estados={estados}
              assignees={assignees}
              toolbarStart={selectorMias}
            />
          ) : (
            <ProyectosWorkspace
              key="creadas"
              tasks={misTareasCreadas}
              columns={misTareasCreadasColumns}
              columnKeyBy="estadoName"
              estados={estados}
              assignees={assignees}
              toolbarStart={selectorMias}
            />
          )}
          {/* Tasks I created whose responsible was deactivated: mine to reassign. */}
          {vistaMias === "creadas" && tareasSinResponsableActivo.length > 0 && (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <TriangleAlert className="size-4" />
                Tareas sin responsable activo: reasígnalas a alguien
              </h3>
              <ProyectosWorkspace
                tasks={tareasSinResponsableActivo}
                columns={tareasSinResponsableActivoColumns}
                columnKeyBy="estadoName"
                estados={estados}
                assignees={assignees}
              />
            </div>
          )}
        </div>
      )}
      {tab === "compartidas" && (
        <div className="space-y-8">
          {proyectosCompartidos.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-[#0B2545] dark:text-foreground">Proyectos compartidos</h3>
              {compartidos.length > 0 ? (
                <ProyectosGrid proyectos={compartidos} resumenByProyecto={resumenByProyecto} />
              ) : (
                <p className="text-sm text-muted-foreground">Ningún proyecto coincide con «{query}».</p>
              )}
            </div>
          )}
          <div className="space-y-3">
            {proyectosCompartidos.length > 0 && (
              <h3 className="text-base font-semibold text-[#0B2545] dark:text-foreground">Tareas compartidas</h3>
            )}
            <ProyectosWorkspace
              tasks={compartidoConmigo}
              columns={compartidoColumns}
              columnKeyBy="estadoName"
              estados={estados}
              assignees={assignees}
            />
          </div>
        </div>
      )}
    </section>
  );
}
