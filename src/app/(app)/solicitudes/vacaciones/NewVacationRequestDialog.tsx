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
import { createVacationRequest } from "./actions";

export function NewVacationRequestDialog() {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState("");
  const [daysRequested, setDaysRequested] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [daysPending, setDaysPending] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!daysRequested || !dateFrom || !dateTo || !returnDate) {
      setError("Completa cantidad de días, fecha desde/hasta y fecha de regreso");
      return;
    }
    startTransition(async () => {
      const result = await createVacationRequest({
        period,
        daysRequested: Number(daysRequested),
        dateFrom,
        dateTo,
        returnDate,
        daysPending: daysPending ? Number(daysPending) : null,
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setPeriod("");
      setDaysRequested("");
      setDateFrom("");
      setDateTo("");
      setReturnDate("");
      setDaysPending("");
      setNotes("");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button>Nueva solicitud</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva solicitud de vacaciones</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Período correspondiente</Label>
            <Input placeholder="2026" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cantidad de días solicitados</Label>
            <Input type="number" min="1" value={daysRequested} onChange={(e) => setDaysRequested(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Fecha de regreso</Label>
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Días pendientes</Label>
            <Input type="number" min="0" value={daysPending} onChange={(e) => setDaysPending(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Observaciones (opcional)</Label>
            <textarea
              className="w-full rounded-md border p-2 text-sm"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending}>
            Enviar para aprobación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
