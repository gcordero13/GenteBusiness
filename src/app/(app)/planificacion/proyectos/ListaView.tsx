"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";
import type { TareaListRow } from "./actions";
import { initials } from "./AssigneePicker";
import { progressOpacity } from "./TableroView";

// Soft background tint for a task's own color tag - same hue, low opacity,
// so it reads as a subtle wash behind the row rather than a solid block.
function softTint(hex: string | null): string | undefined {
  if (!hex || hex.length !== 7) return undefined;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return undefined;
  return `rgba(${r}, ${g}, ${b}, 0.1)`;
}

// Creator + assignee, deduped (a self-created, self-assigned task shows
// just one avatar) - the people "involved" with this task per the names
// this schema actually tracks.
function involucrados(t: TareaListRow): { id: string; name: string; photoUrl: string | null }[] {
  const people = [{ id: t.createdBy, name: t.creatorName, photoUrl: t.creatorPhotoUrl }];
  if (t.assigneeId && t.assigneeId !== t.createdBy) {
    people.push({ id: t.assigneeId, name: t.assigneeName ?? t.assigneeId, photoUrl: t.assigneePhotoUrl });
  }
  return people;
}

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
            <th className="p-3 font-medium">Progreso</th>
            <th className="p-3 font-medium">Prioridad</th>
            <th className="p-3 font-medium">Fecha límite</th>
            <th className="p-3 font-medium">Involucrados</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-b last:border-0 hover:brightness-95" style={{ backgroundColor: softTint(t.color) }}>
              <td className="cursor-pointer p-3 font-medium text-foreground" onClick={() => onSelect(t)}>
                <div className="flex items-center gap-1.5">
                  {t.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />}
                  {t.title}
                </div>
              </td>
              <td className="p-3 text-muted-foreground">
                <Link href={`/planificacion/proyectos/${t.proyectoId}`} className="hover:text-[#04B1AF] hover:underline">
                  {t.proyectoName}
                </Link>
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: t.estadoColor ?? "#94a3b8" }} />
                  {t.estadoName ?? "—"}
                </span>
              </td>
              <td className="cursor-pointer p-3" onClick={() => onSelect(t)}>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-[#04B1AF]"
                      style={{ width: `${t.percentComplete}%`, opacity: progressOpacity(t.percentComplete) }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{t.percentComplete}%</span>
                </div>
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                {t.priority ?? "—"}
              </td>
              <td className="cursor-pointer p-3 text-muted-foreground" onClick={() => onSelect(t)}>
                {t.dueDate ?? "—"}
              </td>
              <td className="cursor-pointer p-3" onClick={() => onSelect(t)}>
                <AvatarGroup>
                  {involucrados(t).map((p) => (
                    <Avatar key={p.id} size="sm" title={p.name}>
                      {p.photoUrl && <AvatarImage src={p.photoUrl} alt="" />}
                      <AvatarFallback>{initials(p.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                </AvatarGroup>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
