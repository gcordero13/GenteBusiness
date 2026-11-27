"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listDepartments, updateProyecto, type DepartamentoOption } from "./actions";

const SIN_DEPARTAMENTO = "";

/**
 * "Editar proyecto" (user request, 2026-11-27): name and description for the
 * owner and people it was shared with as "Editar"; the department only for
 * the person who created it.
 */
export function EditarProyectoDialog({
  proyecto,
  isOwner,
}: {
  proyecto: {
    id: string;
    name: string;
    description: string | null;
    departamentoId: string | null;
    departamentoName: string | null;
  };
  isOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(proyecto.name);
  const [description, setDescription] = useState(proyecto.description ?? "");
  const [departamentoId, setDepartamentoId] = useState(proyecto.departamentoId ?? SIN_DEPARTAMENTO);
  const [departamentos, setDepartamentos] = useState<DepartamentoOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open && isOwner && departamentos.length === 0) listDepartments().then(setDepartamentos);
  }, [open, isOwner, departamentos.length]);

  function reset() {
    setName(proyecto.name);
    setDescription(proyecto.description ?? "");
    setDepartamentoId(proyecto.departamentoId ?? SIN_DEPARTAMENTO);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const nuevoDepartamento = departamentoId || null;
      const result = await updateProyecto(proyecto.id, {
        name,
        description,
        // Only send the department when the owner actually changed it.
        ...(isOwner && nuevoDepartamento !== proyecto.departamentoId ? { departamentoId: nuevoDepartamento } : {}),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
        <Pencil className="size-3.5" />
        Editar
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar proyecto</DialogTitle>
          <DialogDescription>Los cambios los ven todas las personas con acceso al proyecto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label htmlFor="editar-proyecto-nombre" className="block text-sm font-medium">
              Nombre
            </label>
            <Input id="editar-proyecto-nombre" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor="editar-proyecto-descripcion" className="block text-sm font-medium">
              Descripción
            </label>
            <textarea
              id="editar-proyecto-descripcion"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Opcional"
              className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>
          {isOwner && (
            <div className="space-y-1">
              <label htmlFor="editar-proyecto-departamento" className="block text-sm font-medium">
                Departamento
              </label>
              <select
                id="editar-proyecto-departamento"
                value={departamentoId}
                onChange={(e) => setDepartamentoId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={SIN_DEPARTAMENTO}>Sin departamento</option>
                {/* The current one, even before the list loads. */}
                {proyecto.departamentoId && !departamentos.some((d) => d.id === proyecto.departamentoId) && (
                  <option value={proyecto.departamentoId}>{proyecto.departamentoName ?? "Departamento actual"}</option>
                )}
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={isPending || !name.trim()} className="bg-[#036E6C] text-white hover:bg-[#024E4D]">
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
