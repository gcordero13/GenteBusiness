"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { savePlatformLogo } from "./actions";

export function PlatformLogoForm({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!logoFile) {
      setError("Selecciona un archivo de imagen");
      return;
    }

    startTransition(async () => {
      const supabase = createBrowserClient();
      const path = `platform/${crypto.randomUUID()}-${logoFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, logoFile);
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);

      const result = await savePlatformLogo(data.publicUrl);
      setError(result.error ?? null);
      setSuccess(!result.error);
      if (!result.error) {
        setLogoUrl(data.publicUrl);
        setLogoFile(null);
      }
    });
  }

  return (
    <div className="max-w-md space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Marca</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Logo actualizado.</p>}
      <div className="flex items-center gap-3">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
          <img src={logoUrl} alt="" className="size-12 rounded object-contain" />
        )}
        <div className="space-y-1">
          <Label>Logo de la plataforma</Label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <Button onClick={submit} disabled={isPending || !logoFile}>
        Guardar
      </Button>
    </div>
  );
}
