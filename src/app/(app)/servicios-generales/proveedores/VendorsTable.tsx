"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setMaintenanceVendorStatus, type MaintenanceVendorRow } from "../actions";
import { VendorFormDialog } from "./VendorFormDialog";

export function VendorsTable({ vendors }: { vendors: MaintenanceVendorRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggleStatus(vendor: MaintenanceVendorRow) {
    startTransition(async () => {
      await setMaintenanceVendorStatus(vendor.id, vendor.status === "activo" ? "inactivo" : "activo");
      router.refresh();
    });
  }

  if (vendors.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Todavía no has registrado ningún proveedor.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-3 font-medium">Nombre</th>
            <th className="pb-2 pr-3 font-medium">Teléfono</th>
            <th className="pb-2 pr-3 font-medium">Notas</th>
            <th className="pb-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id} className={`border-b last:border-0 ${v.status === "inactivo" ? "opacity-50" : ""}`}>
              <td className="py-2 pr-3 font-medium text-foreground">{v.name}</td>
              <td className="py-2 pr-3 text-muted-foreground">{v.phone ?? "—"}</td>
              <td className="max-w-[280px] truncate py-2 pr-3 text-muted-foreground">{v.notes ?? "—"}</td>
              <td className="py-2">
                <div className="flex justify-end gap-1.5">
                  <VendorFormDialog vendor={v} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => toggleStatus(v)}
                    className={v.status === "activo" ? "text-red-600" : "text-emerald-700"}
                  >
                    {v.status === "activo" ? "Desactivar" : "Activar"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
