"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { archivoUrl, type CursoDetail, type DriveFileRef } from "@/lib/aprendizaje/types";
import { setCursoFirma } from "../actions";
import { SharePointUploadButton } from "./SharePointUploadButton";

/**
 * Who signs the certificate of this course: name, position and a signature
 * image. Left empty, the certificate prints a blank line with "Gestión Humana".
 */
export function FirmaCertificadoEditor({ curso }: { curso: CursoDetail }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(curso.firma.nombre ?? "");
  const [cargo, setCargo] = useState(curso.firma.cargo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const imagen = curso.firma.imagen;

  async function save(nextImagen: DriveFileRef | null, message: string): Promise<string | undefined> {
    setError(null);
    setNotice(null);
    const result = await setCursoFirma(curso.id, { nombre, cargo, imagen: nextImagen });
    if (result.error) {
      setError(result.error);
      return result.error;
    }
    setNotice(message);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Award className="size-5 text-[#036E6C] dark:text-[#5FD6D4]" />
        <h2 className="text-lg font-semibold">Firma del certificado</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Aparece en el certificado que reciben quienes terminan el curso. Si lo dejas vacío, sale la línea de firma con
        «Gestión Humana».
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firma-nombre">Nombre de quien firma</Label>
          <Input id="firma-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="firma-cargo">Cargo</Label>
          <Input
            id="firma-cargo"
            placeholder="Gerente de Gestión Humana"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Firma (imagen PNG o JPG)</p>
        <div className="flex flex-wrap items-center gap-3">
          {imagen ? (
            // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived SharePoint URL
            <img
              src={archivoUrl(imagen)}
              alt="Firma del certificado"
              className="h-16 w-48 rounded border bg-white object-contain p-1"
            />
          ) : (
            <span className="text-sm text-muted-foreground">Sin imagen de firma.</span>
          )}
          <SharePointUploadButton
            kind="firma"
            label={imagen ? "Cambiar firma" : "Subir firma"}
            disabled={isPending}
            onUploaded={(file) => save({ driveId: file.driveId, itemId: file.itemId }, "Firma guardada.")}
          />
          {imagen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => startTransition(async () => void (await save(null, "Imagen de firma quitada.")))}
            >
              Quitar firma
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Mejor en PNG con fondo transparente.</p>
      </div>
      <Button size="sm" disabled={isPending} onClick={() => startTransition(async () => void (await save(imagen, "Firma guardada.")))}>
        Guardar firma
      </Button>
    </section>
  );
}
