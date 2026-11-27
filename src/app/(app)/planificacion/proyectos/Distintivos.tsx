// Shared visual pieces of the Proyectos redesign (2026-11-27): one way to
// show an estado, a priority, a due date, progress and a person, in every
// view. No hooks, so they render in server and client components alike.
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "./AssigneePicker";
import { progressOpacity } from "./progress";
import { colorDe, FECHA_TONE_CLASS, fechaLimite } from "./visual";

const SIN_COLOR = "#94a3b8";

/** Estado as a pill: tinted with the estado's own color, readable in both themes. */
export function EstadoPill({ name, color, className = "" }: { name: string | null; color: string | null; className?: string }) {
  if (!name) return <span className="text-sm text-muted-foreground">—</span>;
  const c = color ?? SIN_COLOR;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-foreground ${className}`}
      style={{ backgroundColor: `color-mix(in srgb, ${c} 16%, transparent)` }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

const PRIORIDAD = {
  alta: { label: "Alta", Icon: ArrowUp, className: "text-red-700 dark:text-red-400" },
  media: { label: "Media", Icon: Minus, className: "text-amber-700 dark:text-amber-400" },
  baja: { label: "Baja", Icon: ArrowDown, className: "text-slate-500 dark:text-slate-400" },
} as const;

/** Priority with its icon and color: Alta red, Media amber, Baja gray. */
export function PrioridadBadge({ priority }: { priority: "alta" | "media" | "baja" | null }) {
  if (!priority) return <span className="text-sm text-muted-foreground">—</span>;
  const { label, Icon, className } = PRIORIDAD[priority];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/** "5 dic 2026", "Vence mañana" (amber) or "Venció el 24 nov" (red). */
export function FechaLimiteText({
  dueDate,
  hoy,
  cerrada,
  className = "",
}: {
  dueDate: string | null;
  hoy: string;
  cerrada: boolean;
  className?: string;
}) {
  const f = fechaLimite(dueDate, hoy, cerrada);
  if (!f) return <span className={`text-sm text-muted-foreground ${className}`}>—</span>;
  return <span className={`text-xs whitespace-nowrap ${FECHA_TONE_CLASS[f.tone]} ${className}`}>{f.label}</span>;
}

/** The one progress bar: brand teal, more intense as it fills (progressOpacity). */
export function BarraAvance({
  percent,
  showLabel = true,
  className = "",
  color = "#04B1AF",
}: {
  percent: number;
  showLabel?: boolean;
  className?: string;
  color?: string;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full transition-[width] duration-300"
          style={{ width: `${percent}%`, backgroundColor: color, opacity: progressOpacity(percent) }}
        />
      </span>
      {showLabel && <span className="w-9 shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">{percent}%</span>}
    </span>
  );
}

/** A person's avatar: photo, else initials on a color that's always the same for them. */
export function PersonaAvatar({
  name,
  photoUrl,
  size = "sm",
  className = "",
}: {
  name: string | null;
  photoUrl: string | null;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className} title={name ?? "Sin asignar"}>
      {photoUrl && <AvatarImage src={photoUrl} alt="" />}
      <AvatarFallback
        className="text-[11px] font-semibold text-white"
        style={{ backgroundColor: name ? colorDe(name) : SIN_COLOR }}
      >
        {name ? initials(name) : "—"}
      </AvatarFallback>
    </Avatar>
  );
}
