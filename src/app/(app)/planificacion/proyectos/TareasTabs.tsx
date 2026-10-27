"use client";

import { useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { EstadoOption, ProyectoListRow, TareaListRow } from "./actions";
import { ProyectosWorkspace } from "./ProyectosWorkspace";
import { progressOpacity, type TableroColumn } from "./TableroView";
import type { AssigneeOption } from "./TareaCreateDialog";

type TareasTab = "proyectos" | "mias" | "compartidas";

const TAB_OPTIONS: { key: TareasTab; label: string }[] = [
  { key: "proyectos", label: "Mis proyectos" },
  { key: "mias", label: "Mis tareas" },
  { key: "compartidas", label: "Compartido conmigo" },
];

function ProyectoCard({ proyecto, percent }: { proyecto: ProyectoListRow; percent?: number }) {
  return (
    <Link
      href={`/planificacion/proyectos/${proyecto.id}`}
      className="block rounded-xl border p-3 text-sm transition-colors hover:border-[#04B1AF] hover:bg-[#04B1AF]/5"
    >
      <p className="font-semibold text-foreground">{proyecto.name}</p>
      {proyecto.description && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{proyecto.description}</p>
      )}
      {percent !== undefined && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-[#04B1AF]" style={{ width: `${percent}%`, opacity: progressOpacity(percent) }} />
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{percent}%</span>
        </div>
      )}
    </Link>
  );
}

// Landing-page sections ("Mis proyectos" / "Mis tareas" / "Compartido
// conmigo") shown one at a time behind a tab switcher instead of stacked,
// so the page doesn't render everything at once - confirmed with the user
// ("quiero... tener todo en una sola hoja... optimizar espacio").
export function TareasTabs({
  misProyectos,
  proyectosCompartidos,
  percentByProyecto,
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
  percentByProyecto: Record<string, number>;
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

  return (
    <section className="space-y-3">
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        {TAB_OPTIONS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
              tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "proyectos" && (
        <div className="space-y-6">
          <div className="space-y-3">
            {misProyectos.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {misProyectos.map((p) => (
                  <ProyectoCard key={p.id} proyecto={p} percent={percentByProyecto[p.id]} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                Todavía no has creado ningún proyecto.
              </p>
            )}
          </div>

          {proyectosCompartidos.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Compartidos conmigo</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {proyectosCompartidos.map((p) => (
                  <ProyectoCard key={p.id} proyecto={p} percent={percentByProyecto[p.id]} />
                ))}
              </div>
            </div>
          )}

          {tareasSinResponsableActivo.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                <TriangleAlert className="size-4" />
                Tareas sin responsable activo - reasigna a alguien
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

          {misTareasCreadas.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Tareas que he creado</h3>
              <ProyectosWorkspace
                tasks={misTareasCreadas}
                columns={misTareasCreadasColumns}
                columnKeyBy="estadoName"
                estados={estados}
                assignees={assignees}
              />
            </div>
          )}
        </div>
      )}
      {tab === "mias" && (
        <ProyectosWorkspace
          tasks={misTareas}
          columns={misColumns}
          columnKeyBy="estadoName"
          estados={estados}
          assignees={assignees}
        />
      )}
      {tab === "compartidas" && (
        <ProyectosWorkspace
          tasks={compartidoConmigo}
          columns={compartidoColumns}
          columnKeyBy="estadoName"
          estados={estados}
          assignees={assignees}
        />
      )}
    </section>
  );
}
