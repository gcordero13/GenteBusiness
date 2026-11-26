import { progressPercent } from "./mapCurso";
import type { CatalogCurso } from "./types";

const TIMEZONE = "America/Santo_Domingo";

export function splitMisCursos(cursos: CatalogCurso[]): { enProgreso: CatalogCurso[]; completados: CatalogCurso[] } {
  const percent = (c: CatalogCurso) => progressPercent(c.completedLecciones, c.leccionCount);
  return {
    enProgreso: cursos.filter((c) => c.enrolled && !c.completedAt).sort((a, b) => percent(b) - percent(a)),
    completados: cursos
      .filter((c) => c.completedAt)
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
  };
}

/** The banner's nudge, based on the most advanced course in progress. */
export function siguientePaso(enProgreso: CatalogCurso[]): string | null {
  const curso = enProgreso[0];
  if (!curso) return null;
  const faltan = curso.leccionCount - curso.completedLecciones;
  if (faltan > 0) {
    return `Te ${faltan === 1 ? "falta 1 lección" : `faltan ${faltan} lecciones`} para terminar “${curso.title}”.`;
  }
  // Every lesson done but not completed: with quizzes, the grade is below the minimum.
  if (curso.hasEvaluacion) return `Repite algún cuestionario de “${curso.title}” para alcanzar la nota mínima.`;
  return null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export function primerNombre(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}
