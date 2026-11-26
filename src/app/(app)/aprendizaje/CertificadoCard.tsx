import Link from "next/link";
import { Award } from "lucide-react";
import { formatFecha } from "@/lib/aprendizaje/portada";
import type { CatalogCurso } from "@/lib/aprendizaje/types";

export function CertificadoCard({ curso }: { curso: CatalogCurso }) {
  return (
    <Link
      href={`/aprendizaje/${curso.id}`}
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-xl border border-dashed border-[#04B1AF]/40" />
      <div className="relative flex items-center gap-2.5">
        <span className="flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <Award className="size-6" />
        </span>
        <span className="text-xs font-bold tracking-widest text-amber-800 uppercase dark:text-amber-300">Certificado</span>
      </div>
      <h3 className="relative font-bold text-foreground">{curso.title}</h3>
      <p className="relative text-sm text-muted-foreground">
        {curso.completedAt && `Completado el ${formatFecha(curso.completedAt)}`}
        {curso.nota !== null && ` · Nota ${curso.nota}%`}
      </p>
      <span className="relative self-start rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
        PDF próximamente
      </span>
    </Link>
  );
}
