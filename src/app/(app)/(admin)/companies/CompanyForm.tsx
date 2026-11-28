"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { sanitizeFileName } from "@/lib/storagePath";
import { FIELD_CLASS_NAME } from "@/lib/aprendizaje/types";
import { plantillaDeEmpresa } from "../../contacts/firmas/firmaDatos";
import { saveCompany } from "./actions";

interface CompanyInput {
  id: string;
  name: string;
  logo_url: string | null;
  firma_fondo_url: string | null;
  firma_plantilla: string | null;
}

const DISTRIBUCIONES = [
  { valor: "sbc", label: "Oscura (como Sánchez Business & Corp)" },
  { valor: "jsc", label: "Azul y naranja (como José Sánchez Comercial)" },
  { valor: "kexford", label: "Turquesa (como Kexford)" },
] as const;

const ARTE_MAX = 10 * 1024 * 1024;

/** Uploads an image to the public company-logos bucket and returns its URL. */
async function subir(file: File): Promise<{ url?: string; error?: string }> {
  const supabase = createBrowserClient();
  const path = `${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage.from("company-logos").upload(path, file);
  if (error) return { error: error.message };
  return { url: supabase.storage.from("company-logos").getPublicUrl(path).data.publicUrl };
}

export function CompanyForm({ initial }: { initial?: CompanyInput }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [arteUrl, setArteUrl] = useState(initial?.firma_fondo_url ?? null);
  const [arteFile, setArteFile] = useState<File | null>(null);
  const [plantilla, setPlantilla] = useState(initial?.firma_plantilla ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      let finalLogoUrl = logoUrl;
      let finalArteUrl = arteUrl;

      if (logoFile) {
        const r = await subir(logoFile);
        if (r.error) return setError(r.error);
        finalLogoUrl = r.url!;
      }
      if (arteFile) {
        if (arteFile.size > ARTE_MAX) return setError("El arte de la firma no puede pasar de 10 MB.");
        const r = await subir(arteFile);
        if (r.error) return setError(r.error);
        finalArteUrl = r.url!;
      }

      const result = await saveCompany(initial?.id, {
        name,
        logoUrl: finalLogoUrl,
        firmaFondoUrl: finalArteUrl,
        firmaPlantilla: plantilla || null,
      });
      setError(result.error ?? null);
      if (!result.error) {
        if (!initial) {
          setName("");
          setLogoUrl(null);
          setLogoFile(null);
          setArteUrl(null);
          setArteFile(null);
          setPlantilla("");
        }
        setOpen(false);
      }
    });
  }

  const porNombre = DISTRIBUCIONES.find((d) => d.valor === plantillaDeEmpresa(name))!;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nueva empresa</Button>
          )
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre de la empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="space-y-1">
          <Label>Logo (opcional)</Label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
          {logoUrl && !logoFile && (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
            <img src={logoUrl} alt="" className="mt-2 h-12 w-12 rounded object-contain" />
          )}
        </div>

        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-semibold">Firma de correo</legend>
          <p className="text-xs text-muted-foreground">
            Todos los contactos de esta empresa ven su firma en Mi perfil con este diseño, su foto y sus datos.
          </p>
          <div className="space-y-1">
            <Label htmlFor={`firma-arte-${initial?.id ?? "nueva"}`}>Arte de fondo (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              La imagen de la firma sin nombre, foto, datos ni íconos, de 1004 × 590 px o con esa proporción. Sin arte, se dibuja
              el diseño con el logo.
            </p>
            <input
              id={`firma-arte-${initial?.id ?? "nueva"}`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setArteFile(e.target.files?.[0] ?? null)}
            />
            {arteUrl && !arteFile && (
              <div className="mt-2 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL */}
                <img src={arteUrl} alt="Arte actual de la firma" className="h-16 w-auto rounded border object-contain" />
                <Button type="button" variant="outline" size="sm" onClick={() => setArteUrl(null)}>
                  Quitar arte
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`firma-distribucion-${initial?.id ?? "nueva"}`}>Distribución</Label>
            <p className="text-xs text-muted-foreground">Dónde van la foto y los datos sobre el arte.</p>
            <select
              id={`firma-distribucion-${initial?.id ?? "nueva"}`}
              className={FIELD_CLASS_NAME}
              value={plantilla}
              onChange={(e) => setPlantilla(e.target.value)}
            >
              <option value="">Según el nombre: {porNombre.label}</option>
              {DISTRIBUCIONES.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
