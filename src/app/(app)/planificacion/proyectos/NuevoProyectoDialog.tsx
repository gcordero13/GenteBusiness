"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProyecto, listDepartments, type DepartamentoOption } from "./actions";

type Mode = "simple" | "avanzado";

// Confirmed with the user: most projects don't need a department, so the
// field stays out of the way behind an explicit "Avanzado" choice instead
// of always showing up - "simple" is exactly today's create flow.
export function NuevoProyectoDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("simple");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [departamentos, setDepartamentos] = useState<DepartamentoOption[]>([]);
  const [departamentoId, setDepartamentoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open && mode === "avanzado" && departamentos.length === 0) {
      listDepartments().then(setDepartamentos);
    }
  }, [open, mode, departamentos.length]);

  function reset() {
    setMode("simple");
    setName("");
    setDescription("");
    setDepartamentoId("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createProyecto(name, description, mode === "avanzado" ? departamentoId || null : null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.push(`/planificacion/proyectos/${result.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger render={<Button className="gap-2 bg-[#036E6C] text-white hover:bg-[#024E4D]" />}>
        <Plus className="size-4" />
        Nuevo proyecto
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setMode("simple")}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                mode === "simple" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => setMode("avanzado")}
              className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                mode === "avanzado" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Avanzado
            </button>
          </div>
          <Input placeholder="Nombre del proyecto" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
          />
          {mode === "avanzado" && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Departamento</label>
              <Select value={departamentoId} onValueChange={(v) => setDepartamentoId(v || "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {() => departamentos.find((d) => d.id === departamentoId)?.name ?? "Sin departamento"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {departamentos.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name.trim()} className="w-full bg-[#036E6C] text-white hover:bg-[#024E4D]">
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
