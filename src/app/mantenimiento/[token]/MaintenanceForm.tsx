"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAINTENANCE_CHECKLIST_ITEMS } from "@/lib/maintenanceChecklist";
import { MAINTENANCE_CORRECTIVO_FIELDS } from "@/lib/maintenanceCorrectivoFields";
import { saveMaintenanceProgress, type MaintenanceProgressInput } from "./actions";

export interface MaintenanceFormRecord extends MaintenanceProgressInput {
  type: string;
  first_name: string;
  last_name: string;
  position: string | null;
  company_name: string | null;
  department_name: string | null;
  email: string | null;
}

export function MaintenanceForm({ token, record }: { token: string; record: MaintenanceFormRecord }) {
  const router = useRouter();
  const [fields, setFields] = useState<MaintenanceProgressInput>({
    host_name: record.host_name ?? "",
    ram: record.ram ?? "",
    os: record.os ?? "",
    storage_total: record.storage_total ?? "",
    storage_used: record.storage_used ?? "",
    storage_free: record.storage_free ?? "",
    findings: record.findings ?? "",
    observations: record.observations ?? "",
    ...Object.fromEntries(MAINTENANCE_CHECKLIST_ITEMS.map((item) => [item.key, record[item.key]])),
    ...Object.fromEntries(
      MAINTENANCE_CORRECTIVO_FIELDS.map((field) => [field.key, record[field.key] ?? ""]),
    ),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function setText(key: keyof MaintenanceProgressInput, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function setChecklist(key: string, value: boolean) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveMaintenanceProgress(token, fields);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-medium">Información del Usuario</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Nombre</dt>
          <dd>
            {record.first_name} {record.last_name}
          </dd>
          <dt className="text-muted-foreground">Posición</dt>
          <dd>{record.position ?? "-"}</dd>
          <dt className="text-muted-foreground">Empresa</dt>
          <dd>{record.company_name ?? "-"}</dd>
          <dt className="text-muted-foreground">Departamento</dt>
          <dd>{record.department_name ?? "-"}</dd>
          <dt className="text-muted-foreground">Correo</dt>
          <dd>{record.email ?? "-"}</dd>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Información del Equipo</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input placeholder="Nombre del Host" value={fields.host_name} onChange={(e) => setText("host_name", e.target.value)} />
          <Input placeholder="Memoria RAM" value={fields.ram} onChange={(e) => setText("ram", e.target.value)} />
          <Input placeholder="Sistema Operativo" value={fields.os} onChange={(e) => setText("os", e.target.value)} />
          <Input placeholder="Almacenamiento Total" value={fields.storage_total} onChange={(e) => setText("storage_total", e.target.value)} />
          <Input placeholder="Almacenamiento Utilizado" value={fields.storage_used} onChange={(e) => setText("storage_used", e.target.value)} />
          <Input placeholder="Almacenamiento Libre" value={fields.storage_free} onChange={(e) => setText("storage_free", e.target.value)} />
        </div>
      </section>

      {record.type === "correctivo" ? (
        <section className="space-y-2">
          <h2 className="font-medium">Diagnóstico y Solución</h2>
          {MAINTENANCE_CORRECTIVO_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-sm text-muted-foreground">{field.label}</label>
              <textarea
                className="w-full rounded-md border p-2 text-sm"
                rows={2}
                value={(fields[field.key as keyof MaintenanceProgressInput] as string) ?? ""}
                onChange={(e) => setText(field.key as keyof MaintenanceProgressInput, e.target.value)}
              />
            </div>
          ))}
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="font-medium">Checklist de Mantenimiento</h2>
          <div className="space-y-1">
            {MAINTENANCE_CHECKLIST_ITEMS.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(fields[item.key as keyof MaintenanceProgressInput])}
                  onChange={(e) => setChecklist(item.key, e.target.checked)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium">Hallazgos</h2>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={3}
          value={fields.findings}
          onChange={(e) => setText("findings", e.target.value)}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Observaciones</h2>
        <textarea
          className="w-full rounded-md border p-2 text-sm"
          rows={3}
          value={fields.observations}
          onChange={(e) => setText("observations", e.target.value)}
        />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">Progreso guardado</p>}
      <Button type="button" onClick={save} disabled={isPending}>
        Guardar progreso
      </Button>
    </div>
  );
}
