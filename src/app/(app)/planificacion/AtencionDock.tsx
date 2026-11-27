"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, CircleCheck, TriangleAlert } from "lucide-react";
import { EstadoPill, FechaLimiteText, PrioridadBadge } from "./proyectos/Distintivos";

export interface AtencionItem {
  id: string;
  title: string;
  proyectoId: string;
  proyectoName: string;
  estadoName: string | null;
  estadoColor: string | null;
  priority: "alta" | "media" | "baja" | null;
  dueDate: string | null;
}

/**
 * "Necesitan tu atención", docked at the bottom edge of the screen (user
 * request, 2026-11-27): always minimized - only the title and how many tasks
 * need attention - until the person opens it.
 */
export function AtencionDock({ items, hoy }: { items: AtencionItem[]; hoy: string }) {
  const [abierta, setAbierta] = useState(false);
  const toggle = () => setAbierta((prev) => !prev);

  const hay = items.length > 0;

  return (
    <section
      aria-labelledby="atencion-title"
      className="sticky bottom-0 z-20 -mx-4 mt-auto border-t bg-card/95 shadow-[0_-8px_24px_-12px_rgba(11,37,69,0.25)] backdrop-blur sm:-mx-6 sm:rounded-t-2xl sm:border-x lg:-mx-8"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={abierta}
        aria-controls="atencion-lista"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-6"
      >
        <span className="flex items-center gap-2.5">
          {hay ? (
            <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <CircleCheck className="size-4 text-emerald-600" />
          )}
          <h2 id="atencion-title" className="text-base font-semibold text-[#0B2545] dark:text-foreground">
            Necesitan tu atención
          </h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              hay ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300" : "bg-muted text-muted-foreground"
            }`}
          >
            {items.length}
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">· vencidas o por vencer en 2 días</span>
        </span>
        <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          <span className="hidden sm:inline">{abierta ? "Minimizar" : "Ver tareas"}</span>
          {abierta ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </span>
      </button>

      {abierta && (
        <div id="atencion-lista" className="max-h-[min(16rem,35dvh)] overflow-y-auto border-t">
          {!hay ? (
            <p className="px-4 py-4 text-sm text-muted-foreground sm:px-6">Nada urgente por ahora. ¡Vas al día!</p>
          ) : (
            <ul>
              {items.map((t) => (
                <li key={t.id} className="border-b last:border-0">
                  <Link
                    href={`/planificacion/proyectos/${t.proyectoId}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 hover:bg-muted/50 sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_6rem_9rem] sm:px-6"
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
        </div>
      )}
    </section>
  );
}
