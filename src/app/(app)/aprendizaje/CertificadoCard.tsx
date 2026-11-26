import Link from "next/link";
import { Award } from "lucide-react";
import { formatFecha } from "@/lib/aprendizaje/portada";
import type { CatalogCurso } from "@/lib/aprendizaje/types";
import { CertificadoPreviewDialog } from "./CertificadoPreviewDialog";

/** A completed course in "Mis certificados": preview the certificate, then download it. */
export function CertificadoCard({ curso }: { curso: CatalogCurso }) {
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm">
      <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-xl border border-dashed border-[#04B1AF]/40" />
      <div className="relative flex items-center gap-2.5">
        <span className="flex size-11 items-center justify-center rounded-full bg-[#04B1AF]/10 text-[#036E6C] dark:text-[#5FD6D4]">
          <Award className="size-6" />
        </span>
        <span className="text-xs font-bold tracking-widest text-[#036E6C] uppercase dark:text-[#5FD6D4]">Certificado</span>
      </div>
      <h3 className="relative font-bold text-foreground">
        <Link href={`/aprendizaje/${curso.id}`} className="hover:underline">
          {curso.title}
        </Link>
      </h3>
      <p className="relative text-sm text-muted-foreground">
        {curso.completedAt && `Completado el ${formatFecha(curso.completedAt)}`}
        {curso.nota !== null && ` · Nota ${curso.nota}%`}
      </p>
      <CertificadoPreviewDialog
        cursoId={curso.id}
        cursoTitle={curso.title}
        triggerClassName="relative inline-flex items-center gap-1.5 self-start rounded-lg bg-[#036E6C] px-3 py-2 text-sm font-semibold text-white hover:bg-[#024E4D]"
      />
    </div>
  );
}
