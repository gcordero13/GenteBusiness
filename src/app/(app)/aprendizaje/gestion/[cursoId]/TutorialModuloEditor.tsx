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
 * Makes the course the tutorial of a platform module and, optionally, pops
 * its first video up at login ("Nuevo módulo") for people with that module.
 */
export function TutorialModuloEditor({ curso, modulos }: { curso: CursoDetail; modulos: ModuloOption[] }) {
  const router = useRouter();
  const [moduleKey, setModuleKey] = useState(curso.tutorialModulo ?? NINGUNO);
  const [anunciar, setAnunciar] = useState(curso.anunciarAlIniciar);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tieneVideo = curso.lecciones.some((l) => l.videoUrl || l.videoFile);

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await setTutorialModulo(curso.id, moduleKey || null, anunciar);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice("Tutorial guardado.");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <MonitorPlay className="size-5 text-[#036E6C] dark:text-[#5FD6D4]" />
        <h2 className="text-lg font-semibold">Tutorial de un módulo</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Si este curso explica un módulo de la plataforma, al iniciar sesión les aparece su primer video como «Nuevo módulo»
        a quienes tienen ese módulo en su perfil, hasta que lo cierren.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor="tutorial-modulo">Módulo</Label>
        <select
          id="tutorial-modulo"
          className={FIELD_CLASS_NAME}
          value={moduleKey}
          onChange={(e) => {
            setModuleKey(e.target.value);
            if (!e.target.value) setAnunciar(false);
          }}
        >
          <option value={NINGUNO}>Ninguno</option>
          {modulos.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={anunciar}
          disabled={!moduleKey}
          onChange={(e) => setAnunciar(e.target.checked)}
          className="accent-[#04B1AF]"
        />
        Mostrar al iniciar sesión
      </label>
      {anunciar && curso.status !== "publicado" && (
        <p className="text-sm text-amber-700 dark:text-amber-300">Se mostrará cuando publiques el curso.</p>
      )}
      {anunciar && !tieneVideo && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Agrega un video a una lección: el aviso muestra el primer video del curso.
        </p>
      )}
      <Button size="sm" onClick={save} disabled={isPending}>
        Guardar tutorial
      </Button>
    </section>
  );
}
