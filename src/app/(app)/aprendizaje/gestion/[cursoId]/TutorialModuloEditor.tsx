"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FIELD_CLASS_NAME, type CursoDetail, type ModuloOption } from "@/lib/aprendizaje/types";
import { setTutorialModulo } from "../actions";

const NINGUNO = "";

/**
 * A tutorial's pop-up (user request, 2026-11-27): when published with a video
 * or an image, it shows up in a window when the platform opens, until each
 * person closes it. Optionally it explains a module, and then only people
 * with that module see it; otherwise everyone with access to Aprende does.
 */
export function TutorialModuloEditor({ curso, modulos }: { curso: CursoDetail; modulos: ModuloOption[] }) {
  const router = useRouter();
  const [moduleKey, setModuleKey] = useState(curso.tutorialModulo ?? NINGUNO);
  const [anunciar, setAnunciar] = useState(curso.anunciarAlIniciar);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tieneMedio =
    Boolean(curso.cover) ||
    curso.lecciones.some((l) => l.videoUrl || l.videoFile || l.archivos.some((a) => a.contentType.startsWith("image/")));

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await setTutorialModulo(curso.id, moduleKey || null, anunciar);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Aviso guardado.");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <MonitorPlay className="size-5 text-[#036E6C] dark:text-[#5FD6D4]" />
        <h2 className="text-lg font-semibold">Aviso al abrir la plataforma</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Al publicarlo, este tutorial aparece en una ventana con su video (o su imagen, si no tiene video) cuando cada persona
        abre la plataforma, hasta que la cierra.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={anunciar}
          onChange={(e) => setAnunciar(e.target.checked)}
          className="accent-[#04B1AF]"
        />
        Mostrar al abrir la plataforma
      </label>
      <div className="max-w-md space-y-1.5">
        <Label htmlFor="tutorial-modulo">¿Explica un módulo?</Label>
        <select id="tutorial-modulo" className={FIELD_CLASS_NAME} value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>
          <option value={NINGUNO}>No, es general: lo ven todos los que tienen acceso a Aprende</option>
          {modulos.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}: solo quienes tienen permiso en este módulo
            </option>
          ))}
        </select>
      </div>
      {anunciar && curso.status !== "publicado" && (
        <p className="text-sm text-amber-700 dark:text-amber-300">Se mostrará cuando publiques el tutorial.</p>
      )}
      {anunciar && !tieneMedio && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Agrega un video o una imagen (en una lección o como portada): la ventana muestra el primer video o, si no hay, la
          primera imagen.
        </p>
      )}
      <Button size="sm" onClick={save} disabled={isPending}>
        Guardar aviso
      </Button>
    </section>
  );
}
