"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { submitComplaint } from "./actions";
import { MyComplaintsList, rememberAnonymousComplaintId } from "./MyComplaintsList";

const CATEGORIES = [
  { value: "acoso", label: "Acoso" },
  { value: "seguridad", label: "Seguridad" },
  { value: "etica", label: "Ética" },
  { value: "recursos_humanos", label: "Recursos Humanos" },
  { value: "otro", label: "Otro" },
];

export function NewComplaintForm() {
  const router = useRouter();
  const [category, setCategory] = useState("otro");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!message.trim()) {
      setError("Escribe un mensaje antes de enviar.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitComplaint({ category, message, isAnonymous, photo });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id && result.isAnonymous) {
        rememberAnonymousComplaintId(result.id);
      }
      setSuccess(true);
      setMessage("");
      setCategory("otro");
      setPhoto(null);
      setPhotoInputKey((k) => k + 1);
      setIsAnonymous(true);
      setRefreshKey((k) => k + 1);
      router.refresh();
    });
  }

  return (
    <>
      {success ? (
        <div className="rounded-2xl border border-[#04B1AF]/20 bg-[#04B1AF]/5 p-6 text-center">
          <p className="text-lg font-semibold">Tu queja fue enviada.</p>
          <p className="mt-1 text-sm text-muted-foreground">Gracias por reportarlo.</p>
          <Button className="mt-4" variant="outline" onClick={() => setSuccess(false)}>
            Enviar otra
          </Button>
        </div>
      ) : (
        <div className="max-w-3xl space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label>Categoría</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-lg border px-4 py-2 text-base ${
                    category === c.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Mensaje</Label>
            <textarea
              className="w-full rounded-md border p-2 text-base"
              rows={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe lo que quieres reportar..."
            />
          </div>
          <div className="space-y-1">
            <Label>Foto (opcional)</Label>
            <input
              key={photoInputKey}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file && file.size > 5 * 1024 * 1024) {
                  setError("La imagen no puede pesar más de 5 MB");
                  setPhoto(null);
                  e.target.value = "";
                  return;
                }
                setError(null);
                setPhoto(file);
              }}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            {photo && <p className="text-xs text-muted-foreground">Seleccionado: {photo.name}</p>}
          </div>
          <div className="space-y-1">
            <Label>¿Cómo quieres enviarla?</Label>
            <div className="inline-flex rounded-lg border p-1">
              {(
                [
                  { value: true, label: "Anónima" },
                  { value: false, label: "Con mi nombre" },
                ] as const
              ).map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => setIsAnonymous(option.value)}
                  className={`rounded-md px-4 py-2 text-base ${
                    isAnonymous === option.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <Button size="lg" onClick={submit} disabled={isPending}>
            Enviar queja
          </Button>
        </div>
      )}
      <MyComplaintsList refreshKey={refreshKey} />
    </>
  );
}
