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
import { saveContact, type ContactInput } from "./actions";

interface Option {
  id: string;
  name: string;
}

export function ContactForm({
  companies,
  departments,
  supervisors,
  initial,
}: {
  companies: Option[];
  departments: Option[];
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
      reports_to_id: "",
      photo_url: "",
    },
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function field<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    startTransition(async () => {
      let photoUrl = form.photo_url;

      if (photoFile) {
        const supabase = createBrowserClient();
        const path = `${crypto.randomUUID()}-${photoFile.name}`;
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
      <div className="grid grid-cols-2 gap-2">
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
      <div className="grid grid-cols-2 gap-2">
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
        <Select value={form.company_id} onValueChange={(v) => field("company_id", v ?? "")}>
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
            {departments.map((d) => (
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
