"use client";

import dynamic from "next/dynamic";
import type { SealWithUrl, SignatureWithUrl } from "./page";

const PdfStamperTool = dynamic(
  () => import("./PdfStamperTool").then((mod) => mod.PdfStamperTool),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Cargando herramienta de sellos y firmas...
      </div>
    ),
  },
);

export function PdfStamperToolClient({
  seals,
  signatures,
}: {
  seals: SealWithUrl[];
  signatures: SignatureWithUrl[];
}) {
  return <PdfStamperTool seals={seals} signatures={signatures} />;
}
