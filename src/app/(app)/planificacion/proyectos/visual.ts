// Plain module (no "use client"/"use server"): the visual rules shared by
// every Proyectos screen - approved redesign of 2026-11-27 (one way to show
// dates, priority, project health and colors across Lista, Tablero, the
// task panel and the landing page). Used by server and client components.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Today as YYYY-MM-DD in the company's time zone. */
export function hoyISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(now);
}

function partes(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) } : null;
}

/** "5 dic 2026". */
export function fechaCorta(iso: string): string {
  const p = partes(iso);
  return p ? `${p.d} ${MESES[p.m - 1]} ${p.y}` : iso;
}

function diasEntre(desde: string, hasta: string): number {
  const a = partes(desde);
  const b = partes(hasta);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export type FechaTone = "normal" | "pronto" | "vencida";

/**
 * A due date the way people read it: "5 dic 2026", "Vence mañana", or
 * "Venció el 24 nov" for open tasks past their date. Closed tasks always
 * show the plain date.
 */
export function fechaLimite(
  dueDate: string | null,
  hoy: string,
  cerrada: boolean,
): { label: string; tone: FechaTone } | null {
  if (!dueDate) return null;
  if (cerrada) return { label: fechaCorta(dueDate), tone: "normal" };
  const dias = diasEntre(hoy, dueDate);
  if (dias < 0) {
    const p = partes(dueDate)!;
    return { label: `Venció el ${p.d} ${MESES[p.m - 1]}`, tone: "vencida" };
  }
  if (dias === 0) return { label: "Vence hoy", tone: "pronto" };
  if (dias === 1) return { label: "Vence mañana", tone: "pronto" };
  return { label: fechaCorta(dueDate), tone: "normal" };
}

export const FECHA_TONE_CLASS: Record<FechaTone, string> = {
  normal: "text-muted-foreground",
  pronto: "font-semibold text-amber-700 dark:text-amber-400",
  vencida: "font-semibold text-red-700 dark:text-red-400",
};

export function esCerrada(kind: string | null): boolean {
  return kind === "completado" || kind === "cancelado";
}

/** Open and past its due date. */
export function estaVencida(t: { dueDate: string | null; estadoKind: string | null; percentComplete: number }, hoy: string): boolean {
  return Boolean(t.dueDate) && !esCerrada(t.estadoKind) && t.percentComplete < 100 && t.dueDate! < hoy;
}

export type SaludTone = "ok" | "atento" | "riesgo";

/** Project health from its overdue tasks: 0 Al día, 1–2 Atento, 3+ En riesgo. */
export function saludProyecto(vencidas: number): { label: string; tone: SaludTone } {
  if (vencidas === 0) return { label: "Al día", tone: "ok" };
  if (vencidas <= 2) return { label: "Atento", tone: "atento" };
  return { label: "En riesgo", tone: "riesgo" };
}

export const SALUD_TONE_CLASS: Record<SaludTone, string> = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  atento: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  riesgo: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

/** "2/5" done direct sub-tasks, or null without sub-tasks. */
export function subtareasResumen(hijas: { percentComplete: number }[]): string | null {
  if (hijas.length === 0) return null;
  return `${hijas.filter((h) => h.percentComplete === 100).length}/${hijas.length}`;
}

export interface ResumenTareas {
  /** Average of ROOT tasks' percent (each already folds in its sub-tasks). */
  percent: number;
  tareas: number;
  completadas: number;
  vencidas: number;
  /** Distinct assignees, in order of appearance. */
  personas: { name: string; photoUrl: string | null }[];
}

interface TareaResumible {
  parentTaskId: string | null;
  percentComplete: number;
  dueDate: string | null;
  estadoKind: string | null;
  assigneeName: string | null;
  assigneePhotoUrl: string | null;
}

/** Header numbers of a project (or planificación) from its tasks. */
export function resumenTareas(tasks: TareaResumible[], hoy: string): ResumenTareas {
  const roots = tasks.filter((t) => !t.parentTaskId);
  const personas = new Map<string, { name: string; photoUrl: string | null }>();
  for (const t of tasks) {
    if (t.assigneeName && !personas.has(t.assigneeName)) {
      personas.set(t.assigneeName, { name: t.assigneeName, photoUrl: t.assigneePhotoUrl });
    }
  }
  return {
    percent: roots.length > 0 ? Math.round(roots.reduce((sum, t) => sum + t.percentComplete, 0) / roots.length) : 0,
    tareas: tasks.length,
    completadas: tasks.filter((t) => t.percentComplete === 100 || t.estadoKind === "completado").length,
    vencidas: tasks.filter((t) => estaVencida(t, hoy)).length,
    personas: [...personas.values()],
  };
}

/**
 * A person's initials ("María Fernández" → "MF"). Lives here, not in the
 * "use client" AssigneePicker, because server components (the project
 * header's avatars) call it too: a function imported from a "use client"
 * module becomes a client reference on the server and crashes the page
 * ("This page couldn't load") when called - the same trap progress.ts notes.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const CONECTORES = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "en", "para", "a", "al"]);

/** "PC" for "Portal de clientes": first letters of the first two words that aren't connectors. */
export function iniciales(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w[0] ?? "") && !CONECTORES.has(w.toLowerCase()));
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Project and avatar colors: deterministic from an id/name, so each project
// and person keeps the same color everywhere (projects have no color field).
const PALETA = ["#04B1AF", "#2563EB", "#7C3AED", "#B45309", "#0B2545", "#BE185D", "#036E6C", "#4F46E5"];

export function colorDe(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}
