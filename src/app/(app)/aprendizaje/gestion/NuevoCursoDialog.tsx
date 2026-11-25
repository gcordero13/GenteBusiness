"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS, FIELD_CLASS_NAME, type CursoCategory } from "@/lib/aprendizaje/types";
import { createCurso } from "./actions";

export function NuevoCursoDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CursoCategory>("curso");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createCurso({ title, description, category });
      if (result.error || !result.id) {
        setError(result.error ?? "No se pudo crear el curso.");
        return;
      }
      setOpen(false);
      router.push(`/aprendizaje/gestion/${result.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        Nuevo curso
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo curso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="curso-title">Título</Label>
            <Input id="curso-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="curso-category">Categoría</Label>
            <select
              id="curso-category"
              className={FIELD_CLASS_NAME}
              value={category}
              onChange={(e) => setCategory(e.target.value as CursoCategory)}
            >
              {(Object.keys(CATEGORY_LABELS) as CursoCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="curso-description">Descripción</Label>
            <textarea
              id="curso-description"
              rows={3}
              className={FIELD_CLASS_NAME}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !title.trim()}>
            Crear y editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
