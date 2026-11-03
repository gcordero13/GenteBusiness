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
import { createVacationRequest, type SolicitudTipo } from "./actions";

const TIPO_OPTIONS: { value: SolicitudTipo; label: string }[] = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "personal", label: "Personal" },
  { value: "familiar", label: "Familiar" },
  { value: "medico", label: "Médico" },
  { value: "perdida", label: "Pérdida" },
  { value: "tramites", label: "Trámites" },
  { value: "otro", label: "Otro" },
];

export function NewVacationRequestDialog() {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<SolicitudTipo>("vacaciones");
  const [period, setPeriod] = useState("");
  const [daysRequested, setDaysRequested] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [daysPending, setDaysPending] = useState("");
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isVacaciones = tipo === "vacaciones";

  function reset() {
    setTipo("vacaciones");
    setPeriod("");
    setDaysRequested("");
    setDateFrom("");
    setDateTo("");
    setReturnDate("");
    setDaysPending("");
    setNotes("");
    setAttachment(null);
    setAttachmentInputKey((k) => k + 1);
  }

  function submit() {
    if (!dateFrom || !dateTo) {
      setError("Completa la fecha desde y hasta");
      return;
    }
    if (isVacaciones && (!daysRequested || !returnDate)) {
      setError("Completa cantidad de días, fecha desde/hasta y fecha de regreso");
      return;
    }
    if (!isVacaciones && !notes.trim()) {
      setError("Completa el motivo de la solicitud");
      return;
    }
    startTransition(async () => {
      const result = await createVacationRequest({
        tipo,
        period: isVacaciones ? period : "",
        daysRequested: isVacaciones ? Number(daysRequested) : null,
        dateFrom,
        dateTo,
        returnDate: isVacaciones ? returnDate : null,
        daysPending: isVacaciones && daysPending ? Number(daysPending) : null,
        notes,
        attachment: isVacaciones ? null : attachment,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
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
          <DialogTitle>Nueva solicitud de permiso</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <div className="flex flex-wrap gap-1 rounded-lg border p-1">
              {TIPO_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    tipo === t.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {isVacaciones ? (
            <>
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
            </>
          ) : (
            <>
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
                <Label>Motivo</Label>
                <textarea
                  className="w-full rounded-md border p-2 text-sm"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Adjuntar documento (opcional)</Label>
                <Input key={attachmentInputKey} type="file" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
              </div>
            </>
          )}
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
