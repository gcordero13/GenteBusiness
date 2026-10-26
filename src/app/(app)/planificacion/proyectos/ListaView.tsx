"use client";

import Link from "next/link";
import type { TareaListRow } from "./actions";

export function ListaView({ tasks, onSelect }: { tasks: TareaListRow[]; onSelect: (t: TareaListRow) => void }) {
  if (tasks.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin tareas todavía.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="p-3 font-medium">Título</th>
            <th className="p-3 font-medium">Proyecto</th>
            <th className="p-3 font-medium">Estado</th>
            <th className="p-3 font-medium">Prioridad</th>
            <th className="p-3 font-medium">Fecha límite</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="cursor-pointer p-3 font-medium text-foreground" onClick={() => onSelect(t)}>
                {t.title}
              </td>
              <td className="p-3 text-muted-foreground">
                <Link href={`/planificacion/proyectos/${t.proyectoId}`} className="hover:text-[#04B1AF] hover:underline">
                  {t.proyectoName}
                </Link>
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                {t.estadoName ?? "—"}
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                {t.priority ?? "—"}
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                {t.dueDate ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
