"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? "¡Copiado!" : "Copiar enlace"}
    </Button>
  );
}
