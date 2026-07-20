"use client";

import { useState, useTransition } from "react";
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
import { createActivity } from "./actions";

export function ActivityForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createActivity(name, eventDate);
      setError(result.error ?? null);
      if (!result.error) {
        setName("");
        setEventDate("");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Nueva actividad</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva actividad o día de fiesta</DialogTitle>
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
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
