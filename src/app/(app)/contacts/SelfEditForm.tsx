"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnContactFields } from "./actions";

export interface OwnContactFields {
  id: string;
  position: string;
  fleet_phone: string;
  extension: string;
  has_whatsapp: boolean;
}

export function SelfEditForm({ initial }: { initial: OwnContactFields }) {
  const [position, setPosition] = useState(initial.position);
  const [fleetPhone, setFleetPhone] = useState(initial.fleet_phone);
  const [extension, setExtension] = useState(initial.extension);
  const [hasWhatsapp, setHasWhatsapp] = useState(initial.has_whatsapp);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await updateOwnContactFields({
        id: initial.id,
        position,
        fleet_phone: fleetPhone,
        extension,
        has_whatsapp: hasWhatsapp,
      });
      setError(result.error ?? null);
      setSaved(!result.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Puedes editar tu puesto, extensión y teléfono de flota. Para cambiar otros datos,
        contacta a un administrador.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Guardado.</p>}
      <div className="space-y-1">
        <Label>Puesto</Label>
        <Input value={position} onChange={(e) => setPosition(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Extensión</Label>
        <Input value={extension} onChange={(e) => setExtension(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Teléfono de flota</Label>
        <Input value={fleetPhone} onChange={(e) => setFleetPhone(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hasWhatsapp} onChange={(e) => setHasWhatsapp(e.target.checked)} />
        Tiene WhatsApp
      </label>
      <Button onClick={submit} disabled={isPending}>
        Guardar
      </Button>
    </div>
  );
}
