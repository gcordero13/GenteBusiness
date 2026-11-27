import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { progressPercent } from "@/lib/aprendizaje/mapCurso";
import { archivoUrl, type CatalogCurso } from "@/lib/aprendizaje/types";
import { CATEGORIA_ICONO } from "./categoriaIcono";

export function CursoCard({ curso }: { curso: CatalogCurso }) {
  const percent = progressPercent(curso.completedLecciones, curso.leccionCount);
  const Icon = CATEGORIA_ICONO[curso.category];

  return (
    <Link
      href={`/aprendizaje/${curso.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-video bg-[#04B1AF]/10">
        {curso.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL; next/image can't optimize it
          <img src={archivoUrl(curso.cover)} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-[#04B1AF]">
            <Icon className="size-10" />
          </div>
        )}
        {curso.completedAt && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
            <CheckCircle2 className="size-3.5" />
            Completado
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold text-foreground group-hover:text-[#04B1AF]">{curso.title}</h3>
        {curso.description && <p className="line-clamp-2 text-sm text-muted-foreground">{curso.description}</p>}
        <div className="mt-auto space-y-1 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {curso.completedLecciones}/{curso.leccionCount} lecciones
            </span>
            <span>{percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[#04B1AF]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
    </Link>
  );
}
