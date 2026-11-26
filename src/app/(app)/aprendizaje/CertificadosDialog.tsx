"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { CatalogCurso } from "@/lib/aprendizaje/types";
import { CertificadoCard } from "./CertificadoCard";

/** The banner's "Certificados" counter: clicking it lists the completed courses. */
export function CertificadosDialog({ certificados, className }: { certificados: CatalogCurso[]; className: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={<button type="button" className={className} aria-label={`Ver mis certificados (${certificados.length})`} />}
      >
        <span className="text-xl font-extrabold tabular-nums sm:text-2xl">{certificados.length}</span>
        <span className="text-xs text-[#E6FAF9] underline decoration-white/50 underline-offset-2 sm:text-sm">
          Certificados
        </span>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mis certificados</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Cursos completados · la descarga en PDF llegará pronto.</p>
        {certificados.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {certificados.map((c) => (
              <CertificadoCard key={c.id} curso={c} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Completa un curso para obtener tu primer certificado.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
