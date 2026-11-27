// Header of a project or planificación page (approved redesign 2026-11-27):
// breadcrumb, colored initials, name with its health pill, description,
// team avatars, actions, and four number cards. No hooks: server-rendered.
import Link from "next/link";
import type { ReactNode } from "react";
import { BarraAvance, PersonaAvatar } from "./Distintivos";
import { colorDe, iniciales, SALUD_TONE_CLASS, saludProyecto, type ResumenTareas } from "./visual";

export function ProyectoEncabezado({
  migas,
  colorKey,
  title,
  description,
  meta,
  resumen,
  actions,
}: {
  /** Breadcrumb before the current page, e.g. [{ label: "Proyectos", href: "/planificacion" }]. */
  migas: { label: string; href: string }[];
  /** Keeps the same color for the project everywhere (its id). */
  colorKey: string;
  title: string;
  description: string | null;
  /** Extra line under the description (e.g. the department link). */
  meta?: ReactNode;
  resumen: ResumenTareas;
  actions: ReactNode;
}) {
  const color = colorDe(colorKey);
  const salud = saludProyecto(resumen.vencidas);
  const visibles = resumen.personas.slice(0, 4);
  const extra = resumen.personas.length - visibles.length;

  return (
    <div className="space-y-5">
      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {migas.map((m) => (
          <span key={m.href} className="flex items-center gap-1.5">
            <Link href={m.href} className="hover:text-foreground hover:underline">
              {m.label}
            </Link>
            <span aria-hidden="true">/</span>
          </span>
        ))}
        <span className="font-medium text-foreground">{title}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white shadow-sm"
            style={{ backgroundColor: color }}
          >
            {iniciales(title)}
          </span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-[#0B2545] sm:text-[28px] dark:text-foreground">{title}</h1>
              {resumen.tareas > 0 && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${SALUD_TONE_CLASS[salud.tone]}`}>
                  {salud.label}
                </span>
              )}
            </div>
            {description && <p className="max-w-prose text-[15px] text-muted-foreground">{description}</p>}
            {meta}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {visibles.length > 0 && (
            <div className="mr-1 flex -space-x-2" aria-label={`Equipo: ${resumen.personas.map((p) => p.name).join(", ")}`}>
              {visibles.map((p) => (
                <PersonaAvatar key={p.name} name={p.name} photoUrl={p.photoUrl} size="default" className="ring-2 ring-background" />
              ))}
              {extra > 0 && (
                <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-2 ring-background">
                  +{extra}
                </span>
              )}
            </div>
          )}
          {actions}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 flex flex-col justify-between gap-2 rounded-2xl border bg-card p-4 shadow-xs lg:col-span-1">
          <span className="text-sm font-medium text-muted-foreground">Avance</span>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-[#0B2545] tabular-nums dark:text-foreground">{resumen.percent}%</span>
            <BarraAvance percent={resumen.percent} showLabel={false} className="flex-1" color={color} />
          </div>
        </div>
        <Numero label="Tareas" value={resumen.tareas} />
        <Numero label="Completadas" value={resumen.completadas} className="text-emerald-700 dark:text-emerald-400" />
        <Numero
          label="Vencidas"
          value={resumen.vencidas}
          className={resumen.vencidas > 0 ? "text-red-700 dark:text-red-400" : "text-[#0B2545] dark:text-foreground"}
        />
      </div>
    </div>
  );
}

function Numero({ label, value, className = "text-[#0B2545] dark:text-foreground" }: { label: string; value: number; className?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4 shadow-xs">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${className}`}>{value}</span>
    </div>
  );
}
