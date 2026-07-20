"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { importContactsCsv, type ImportResult } from "./actions";

export function ImportContactsDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | { error: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!file) return;
    startTransition(async () => {
      const text = await file.text();
      const outcome = await importContactsCsv(text);
      setResult(outcome);
    });
  }

  function reset() {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <Upload className="size-4" />
            Importar CSV
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar contactos desde CSV</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Columnas esperadas: first_name, last_name, email, extension, fleet_phone,
          has_whatsapp, position, company, department, birth_date, status. Los contactos
          se actualizan por coincidencia de correo; sin correo, siempre se crean como
          nuevos.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {result && "error" in result && <p className="text-sm text-red-600">{result.error}</p>}
        {result && "successCount" in result && (
          <div className="text-sm">
            <p>{result.successCount} contacto(s) importado(s) correctamente.</p>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-red-600">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !file}>
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
