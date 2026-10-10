"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { sanitizeFileName } from "@/lib/storagePath";
import { saveLoginBackground } from "./actions";

export function LoginBackgroundForm({ initialBackgroundUrl }: { initialBackgroundUrl: string | null }) {
  const [backgroundUrl, setBackgroundUrl] = useState(initialBackgroundUrl);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!backgroundFile) {
      setError("Selecciona un archivo de imagen");
      return;
    }

    startTransition(async () => {
      const supabase = createBrowserClient();
      const path = `platform/login-bg-${crypto.randomUUID()}-${sanitizeFileName(backgroundFile.name)}`;
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, backgroundFile);
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);

      const result = await saveLoginBackground(data.publicUrl);
      setError(result.error ?? null);
      setSuccess(!result.error);
      if (!result.error) {
        setBackgroundUrl(data.publicUrl);
        setBackgroundFile(null);
      }
    });
  }

  return (
    <div className="max-w-md space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold">Fondo de la pantalla de inicio de sesión</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Fondo actualizado.</p>}
      <div className="flex items-center gap-3">
        {backgroundUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
          <img src={backgroundUrl} alt="" className="h-16 w-28 rounded object-cover" />
        )}
        <div className="space-y-1">
          <Label>Imagen de fondo</Label>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => setBackgroundFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <Button onClick={submit} disabled={isPending || !backgroundFile}>
        Guardar
      </Button>
    </div>
  );
}
