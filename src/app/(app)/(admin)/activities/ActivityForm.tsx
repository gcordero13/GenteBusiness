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
import { saveActivity } from "./actions";

interface ActivityInput {
  id: string;
  name: string;
  eventDate: string;
}

export function ActivityForm({ initial }: { initial?: ActivityInput }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveActivity(initial?.id, name, eventDate);
      setError(result.error ?? null);
      if (!result.error) {
        if (!initial) {
          setName("");
          setEventDate("");
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
            <Button>Nueva actividad</Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar actividad o día de fiesta" : "Nueva actividad o día de fiesta"}
          </DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input
            placeholder="Ej. Día del trabajo, Posada de fin de año"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Fecha</Label>
          <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name || !eventDate}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
