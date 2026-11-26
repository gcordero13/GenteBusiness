import Link from "next/link";
import { BookOpen, Landmark } from "lucide-react";
import { progressPercent } from "@/lib/aprendizaje/mapCurso";
import { archivoUrl, CATEGORY_SHORT_LABELS, type CatalogCurso } from "@/lib/aprendizaje/types";

export function EnProgresoCard({ curso }: { curso: CatalogCurso }) {
  const percent = progressPercent(curso.completedLecciones, curso.leccionCount);
  const faltan = curso.leccionCount - curso.completedLecciones;
  const detalle =
    faltan > 0
      ? `${curso.completedLecciones} de ${curso.leccionCount} lecciones`
      : curso.hasEvaluacion
        ? "Lecciones listas · falta la evaluación"
        : `${curso.leccionCount} lecciones`;
  const Icon = curso.category === "historia" ? Landmark : BookOpen;

  return (
    <Link
      href={`/aprendizaje/${curso.id}`}
      className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#04B1AF]/10 text-[#036E6C] sm:size-24">
        {curso.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
          <img src={archivoUrl(curso.cover)} alt="" className="size-full object-cover" />
        ) : (
          <Icon className="size-9" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-semibold tracking-wide text-[#036E6C] uppercase dark:text-[#5FD6D4]">
          {CATEGORY_SHORT_LABELS[curso.category]}
        </p>
        <h3 className="truncate font-bold text-foreground">{curso.title}</h3>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-xs font-semibold tabular-nums">{percent}%</span>
        </div>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </div>
      <span className="hidden shrink-0 rounded-lg bg-[#036E6C] px-4 py-2.5 text-sm font-semibold text-white group-hover:bg-[#024E4D] sm:inline-flex">
        Continuar
      </span>
    </Link>
  );
}
