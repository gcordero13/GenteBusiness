"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { sanitizeFileName } from "@/lib/storagePath";
import { saveContact, type ContactInput } from "./actions";

interface Option {
  id: string;
  name: string;
}

interface DepartmentOption extends Option {
  company_id: string | null;
}

export function ContactForm({
  companies,
  departments,
  supervisors,
  initial,
}: {
  companies: Option[];
  departments: DepartmentOption[];
  supervisors: Option[];
  initial?: ContactInput;
}) {
  const [form, setForm] = useState<ContactInput>(
    initial ?? {
      first_name: "",
      last_name: "",
      email: "",
      extension: "",
      fleet_phone: "",
      has_whatsapp: false,
      company_id: "",
      department_id: "",
      position: "",
      birth_date: "",
      hire_date: "",
      hikvision_employee_no: "",
      schedule_start_time: "",
      schedule_end_time: "",
      schedule_workdays: [],
      schedule_tolerance_minutes: "",
      reports_to_id: "",
      photo_url: "",
    },
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const visibleDepartments = form.company_id
    ? departments.filter((d) => d.company_id === form.company_id)
    : departments;

  function field<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setCompany(companyId: string) {
    setForm((prev) => ({
      ...prev,
      company_id: companyId,
      department_id: departments.some(
        (d) => d.id === prev.department_id && d.company_id === companyId,
      )
        ? prev.department_id
        : "",
    }));
  }

  function toggleWorkday(day: number) {
    setForm((prev) => ({
      ...prev,
      schedule_workdays: prev.schedule_workdays.includes(day)
        ? prev.schedule_workdays.filter((d) => d !== day)
        : [...prev.schedule_workdays, day].sort((a, b) => a - b),
    }));
  }

  function submit() {
    const scheduleFieldsFilled = [
      Boolean(form.schedule_start_time),
      Boolean(form.schedule_end_time),
      form.schedule_workdays.length > 0,
      Boolean(form.schedule_tolerance_minutes),
    ].filter(Boolean).length;
    if (scheduleFieldsFilled > 0 && scheduleFieldsFilled < 4) {
      setError("Si configuras un horario personalizado, completa los cuatro campos de horario.");
      return;
    }

    startTransition(async () => {
      let photoUrl = form.photo_url;

      if (photoFile) {
        const supabase = createBrowserClient();
        const path = `${crypto.randomUUID()}-${sanitizeFileName(photoFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("contact-photos")
          .upload(path, photoFile);
        if (uploadError) {
          setError(uploadError.message);
          return;
        }
        const { data } = supabase.storage.from("contact-photos").getPublicUrl(path);
        photoUrl = data.publicUrl;
      }

      const result = await saveContact({ ...form, photo_url: photoUrl });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="max-w-md space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input value={form.first_name} onChange={(e) => field("first_name", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Apellido</Label>
          <Input value={form.last_name} onChange={(e) => field("last_name", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Correo</Label>
        <Input type="email" value={form.email} onChange={(e) => field("email", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Extensión</Label>
          <Input value={form.extension} onChange={(e) => field("extension", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Teléfono de flota</Label>
          <Input value={form.fleet_phone} onChange={(e) => field("fleet_phone", e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.has_whatsapp}
          onChange={(e) => field("has_whatsapp", e.target.checked)}
        />
        Tiene WhatsApp
      </label>
      <div className="space-y-1">
        <Label>Empresa</Label>
        <Select value={form.company_id} onValueChange={(v) => setCompany(v ?? "")}>
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
      </div>
      <div className="space-y-1">
        <Label>Departamento</Label>
        <Select value={form.department_id} onValueChange={(v) => field("department_id", v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecciona un departamento">
              {(value: string) =>
                departments.find((d) => d.id === value)?.name ?? "Selecciona un departamento"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {visibleDepartments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Supervisor (jefe directo)</Label>
        <Select value={form.reports_to_id} onValueChange={(v) => field("reports_to_id", v ?? "")}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Sin supervisor">
              {(value: string) => supervisors.find((s) => s.id === value)?.name ?? "Sin supervisor"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {supervisors.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Puesto</Label>
        <Input value={form.position} onChange={(e) => field("position", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Fecha de nacimiento</Label>
        <Input
          type="date"
          value={form.birth_date}
          onChange={(e) => field("birth_date", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Fecha de contratación</Label>
        <Input
          type="date"
          value={form.hire_date}
          onChange={(e) => field("hire_date", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Número de empleado (Hikvision)</Label>
        <Input
          value={form.hikvision_employee_no}
          onChange={(e) => field("hikvision_employee_no", e.target.value)}
        />
      </div>
      <div className="space-y-1 border-t pt-3">
        <Label className="text-sm font-medium">Horario personalizado (opcional)</Label>
        <p className="text-xs text-muted-foreground">
          Déjalo en blanco para usar el horario de la empresa. Si lo llenas, completa los cuatro
          campos.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Hora de entrada</Label>
          <Input
            type="time"
            value={form.schedule_start_time}
            onChange={(e) => field("schedule_start_time", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Hora de salida</Label>
          <Input
            type="time"
            value={form.schedule_end_time}
            onChange={(e) => field("schedule_end_time", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Días laborables</Label>
        <div className="flex gap-3">
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((label, day) => (
            <label key={day} className="flex flex-col items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={form.schedule_workdays.includes(day)}
                onChange={() => toggleWorkday(day)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label>Minutos de tolerancia</Label>
        <Input
          type="number"
          min={0}
          value={form.schedule_tolerance_minutes}
          onChange={(e) => field("schedule_tolerance_minutes", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label>Foto de perfil (opcional)</Label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
        />
        {form.photo_url && !photoFile && (
          <img src={form.photo_url} alt="" className="mt-2 h-16 w-16 rounded-full object-cover" />
        )}
      </div>
      <Button onClick={submit} disabled={isPending || !form.first_name || !form.last_name}>
        Guardar
      </Button>
    </div>
  );
}
