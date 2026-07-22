"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSmtpSettings } from "./actions";

interface Initial {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_sender_name: string;
  smtp_admin_email: string;
}

export function SmtpSettingsForm({ initial }: { initial: Initial }) {
  const [host, setHost] = useState(initial.smtp_host);
  const [port, setPort] = useState(initial.smtp_port);
  const [user, setUser] = useState(initial.smtp_user);
  const [pass, setPass] = useState("");
  const [senderName, setSenderName] = useState(initial.smtp_sender_name);
  const [adminEmail, setAdminEmail] = useState(initial.smtp_admin_email);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await saveSmtpSettings({
        smtp_host: host,
        smtp_port: port,
        smtp_user: user,
        smtp_pass: pass,
        smtp_sender_name: senderName,
        smtp_admin_email: adminEmail,
      });
      setError(result.error ?? null);
      setSuccess(!result.error);
      if (!result.error) setPass("");
    });
  }

  const canSubmit = host && port && user && pass && senderName && adminEmail;

  return (
    <div className="max-w-md space-y-4 rounded-lg border p-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && (
        <p className="text-sm text-emerald-600">
          Configuración guardada. Los correos de invitación y recuperación de clave ahora se
          enviarán desde este servidor.
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="smtp_host">Servidor SMTP</Label>
        <Input
          id="smtp_host"
          placeholder="smtp.office365.com"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="smtp_port">Puerto</Label>
        <Input
          id="smtp_port"
          placeholder="587"
          value={port}
          onChange={(e) => setPort(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="smtp_user">Usuario / correo</Label>
        <Input
          id="smtp_user"
          placeholder="notificaciones@tuempresa.com"
          value={user}
          onChange={(e) => setUser(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="smtp_pass">Contraseña</Label>
        <Input
          id="smtp_pass"
          type="password"
          placeholder="Contraseña o contraseña de aplicación"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="smtp_sender_name">Nombre del remitente</Label>
        <Input
          id="smtp_sender_name"
          placeholder="Gente Sánchez Business"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="smtp_admin_email">Correo del remitente</Label>
        <Input
          id="smtp_admin_email"
          placeholder="notificaciones@tuempresa.com"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
        />
      </div>
      <Button onClick={submit} disabled={isPending || !canSubmit}>
        Guardar
      </Button>
    </div>
  );
}
