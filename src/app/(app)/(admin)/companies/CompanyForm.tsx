"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { saveCompany } from "./actions";

interface CompanyInput {
  id: string;
  name: string;
  logo_url: string | null;
}

export function CompanyForm({ initial }: { initial?: CompanyInput }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      let finalLogoUrl = logoUrl;

      if (logoFile) {
        const supabase = createBrowserClient();
        const path = `${crypto.randomUUID()}-${logoFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("company-logos")
          .upload(path, logoFile);
        if (uploadError) {
          setError(uploadError.message);
          return;
        }
        const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
        finalLogoUrl = data.publicUrl;
      }

      const result = await saveCompany(initial?.id, name, finalLogoUrl);
      setError(result.error ?? null);
      if (!result.error) {
        if (!initial) {
          setName("");
          setLogoUrl(null);
          setLogoFile(null);
        }
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          initial ? (
            <Button variant="ghost" size="icon-sm" title="Editar">
              <Pencil className="size-4" />
            </Button>
          ) : (
            <Button>Nueva empresa</Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Input
          placeholder="Nombre de la empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="space-y-1">
          <Label>Logo (opcional)</Label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          />
          {logoUrl && !logoFile && (
            // eslint-disable-next-line @next/next/no-img-element -- public Supabase Storage URL
            <img src={logoUrl} alt="" className="mt-2 h-12 w-12 rounded object-contain" />
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name}>
            {initial ? "Guardar" : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
