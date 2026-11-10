"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateRequestAsSupervisor, type SolicitudTipo } from "./actions";

const TIPO_OPTIONS: { value: SolicitudTipo; label: string }[] = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "personal", label: "Personal" },
  { value: "familiar", label: "Familiar" },
  { value: "medico", label: "Médico" },
  { value: "perdida", label: "Pérdida" },
  { value: "tramites", label: "Trámites" },
  { value: "otro", label: "Otro" },
];

interface Props {
  requestId: string;
  tipo: string;
  period: string | null;
  daysRequested: number | null;
  dateFrom: string;
  dateTo: string;
  returnDate: string | null;
  daysPending: number | null;
  notes: string | null;
}

// Lets the jefe directo correct a request's own details (dates, tipo, motivo,
// etc.) while it's still pendiente_supervisor, before they approve/reject it
// via VacationRequestActions - that component only ever recorded a decision,
// never let anyone touch what was actually requested.
export function EditVacationRequestForm({
  requestId,
  tipo: initialTipo,
  period,
  daysRequested,
  dateFrom,
  dateTo,
  returnDate,
  daysPending,
  notes,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [tipo, setTipo] = useState<SolicitudTipo>(initialTipo as SolicitudTipo);
  const [periodValue, setPeriodValue] = useState(period ?? "");
  const [daysRequestedValue, setDaysRequestedValue] = useState(daysRequested ? String(daysRequested) : "");
  const [dateFromValue, setDateFromValue] = useState(dateFrom);
  const [dateToValue, setDateToValue] = useState(dateTo);
  const [returnDateValue, setReturnDateValue] = useState(returnDate ?? "");
  const [daysPendingValue, setDaysPendingValue] = useState(daysPending ? String(daysPending) : "");
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isVacaciones = tipo === "vacaciones";

  function save() {
    setError(null);
    if (!dateFromValue || !dateToValue) {
      setError("Completa la fecha desde y hasta");
      return;
    }
    if (isVacaciones && (!daysRequestedValue || !returnDateValue)) {
      setError("Completa cantidad de días, fecha desde/hasta y fecha de regreso");
      return;
    }
    if (!isVacaciones && !notesValue.trim()) {
      setError("Completa el motivo de la solicitud");
      return;
    }
    startTransition(async () => {
      const result = await updateRequestAsSupervisor(requestId, {
        tipo,
        period: isVacaciones ? periodValue : "",
        daysRequested: isVacaciones ? Number(daysRequestedValue) : null,
        dateFrom: dateFromValue,
        dateTo: dateToValue,
        returnDate: isVacaciones ? returnDateValue : null,
        daysPending: isVacaciones && daysPendingValue ? Number(daysPendingValue) : null,
        notes: notesValue,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        Editar solicitud
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
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

      {isVacaciones && (
        <div className="space-y-1">
          <Label>Período correspondiente</Label>
          <Input value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Desde</Label>
          <Input type="date" value={dateFromValue} onChange={(e) => setDateFromValue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Hasta</Label>
          <Input type="date" value={dateToValue} onChange={(e) => setDateToValue(e.target.value)} />
        </div>
      </div>

      {isVacaciones && (
        <>
          <div className="space-y-1">
            <Label>Cantidad de días solicitados</Label>
            <Input type="number" min="1" value={daysRequestedValue} onChange={(e) => setDaysRequestedValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fecha de regreso</Label>
            <Input type="date" value={returnDateValue} onChange={(e) => setReturnDateValue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Días pendientes</Label>
            <Input type="number" min="0" value={daysPendingValue} onChange={(e) => setDaysPendingValue(e.target.value)} />
          </div>
        </>
      )}

      <div className="space-y-1">
        <Label>{isVacaciones ? "Observaciones (opcional)" : "Motivo"}</Label>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={2}
          value={notesValue}
          onChange={(e) => setNotesValue(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={isPending}>
          Guardar cambios
        </Button>
        <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
