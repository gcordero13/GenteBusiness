"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMaintenanceLinkByEmail } from "./actions";

export function SendLinkEmailButton({ recordId }: { recordId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function send() {
    setError(null);
    setSent(false);
    startTransition(async () => {
      const result = await sendMaintenanceLinkByEmail(recordId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={send} disabled={isPending}>
        <Mail className="size-4" />
        {sent ? "¡Enviado!" : "Enviar por correo"}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
