"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createMaintenanceVendor, updateMaintenanceVendor, type MaintenanceVendorInput, type MaintenanceVendorRow } from "../actions";

const EMPTY: MaintenanceVendorInput = { name: "", phone: "", notes: "" };

export function VendorFormDialog({ vendor }: { vendor?: MaintenanceVendorRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MaintenanceVendorInput>(
    vendor ? { name: vendor.name, phone: vendor.phone ?? "", notes: vendor.notes ?? "" } : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = vendor ? await updateMaintenanceVendor(vendor.id, form) : await createMaintenanceVendor(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (!vendor) setForm(EMPTY);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          vendor ? (
            <Button variant="outline" size="sm" />
          ) : (
            <Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />
          )
        }
      >
        {vendor ? (
          "Editar"
        ) : (
          <>
            <Plus className="size-4" />
            Nuevo proveedor
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{vendor ? `Editar ${vendor.name}` : "Nuevo proveedor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Nombre</label>
            <Input
              placeholder="Ej. Taller Pérez"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Teléfono</label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar proveedor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
