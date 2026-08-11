"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
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
import { saveDepartment } from "./actions";

interface Company {
  id: string;
  name: string;
}

interface ScheduleOption {
  id: string;
  name: string;
}

interface DepartmentInput {
  id: string;
  name: string;
  companyId: string;
  defaultScheduleId: string | null;
}

export function DepartmentForm({
  companies,
  schedules,
  initial,
}: {
  companies: Company[];
  schedules: ScheduleOption[];
  initial?: DepartmentInput;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [companyId, setCompanyId] = useState(initial?.companyId ?? companies[0]?.id ?? "");
  const [defaultScheduleId, setDefaultScheduleId] = useState(initial?.defaultScheduleId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveDepartment(initial?.id, name, companyId, defaultScheduleId || null);
      setError(result.error ?? null);
      if (!result.error) {
        if (!initial) {
          setName("");
          setDefaultScheduleId("");
        }
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nuevo departamento</Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar departamento" : "Nuevo departamento"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre del departamento"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecciona una empresa">
              {(value: string) => companies.find((c) => c.id === value)?.name ?? "Selecciona una empresa"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={defaultScheduleId} onValueChange={(v) => setDefaultScheduleId(v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Horario por defecto (opcional)">
              {(value: string) => schedules.find((s) => s.id === value)?.name ?? "Horario por defecto (opcional)"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {schedules.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name || !companyId}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
