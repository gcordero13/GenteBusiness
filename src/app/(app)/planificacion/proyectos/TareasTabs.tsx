"use client";

import { useState } from "react";
import type { EstadoOption, TareaListRow } from "./actions";
import { ProyectosWorkspace } from "./ProyectosWorkspace";
import type { TableroColumn } from "./TableroView";
import type { AssigneeOption } from "./TareaCreateDialog";

type TareasTab = "mias" | "compartidas";

const TAB_OPTIONS: { key: TareasTab; label: string }[] = [
  { key: "mias", label: "Mis tareas" },
  { key: "compartidas", label: "Compartido conmigo" },
];

// Landing-page task sections ("Mis tareas" / "Compartido conmigo") shown one
// at a time behind a tab switcher instead of stacked, so the page doesn't
// render two full ProyectosWorkspace instances at once. Props for each tab
// are the same ones page.tsx used to pass directly to each stacked section.
export function TareasTabs({
  misTareas,
  misColumns,
  compartidoConmigo,
  compartidoColumns,
  estados,
  assignees,
}: {
  misTareas: TareaListRow[];
  misColumns: TableroColumn[];
  compartidoConmigo: TareaListRow[];
  compartidoColumns: TableroColumn[];
  estados: EstadoOption[];
  assignees: AssigneeOption[];
}) {
  const [tab, setTab] = useState<TareasTab>("mias");

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
