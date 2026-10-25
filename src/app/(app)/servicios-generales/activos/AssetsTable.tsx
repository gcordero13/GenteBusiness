"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_BY_KEY } from "../categories";
import { setMaintenanceAssetStatus, type AssignableAppUser, type MaintenanceAssetRow } from "../actions";
import { AssetFormDialog } from "./AssetFormDialog";
import { AssetPhotoUploadDialog } from "./AssetPhotoUploadDialog";

export function AssetsTable({
  assets,
  departments,
  users,
}: {
  assets: MaintenanceAssetRow[];
  departments: { id: string; name: string }[];
  users: AssignableAppUser[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [photoTarget, setPhotoTarget] = useState<MaintenanceAssetRow | null>(null);

  function toggleStatus(asset: MaintenanceAssetRow) {
    startTransition(async () => {
      await setMaintenanceAssetStatus(asset.id, asset.status === "activo" ? "inactivo" : "activo");
      router.refresh();
    });
  }

  if (assets.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Todavía no has registrado ningún activo.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-3 font-medium" />
            <th className="pb-2 pr-3 font-medium">Activo</th>
            <th className="pb-2 pr-3 font-medium">Categoría</th>
            <th className="pb-2 pr-3 font-medium">Marca / Especificación</th>
            <th className="pb-2 pr-3 font-medium">Placa / Km</th>
            <th className="pb-2 pr-3 font-medium">Departamento</th>
            <th className="pb-2 pr-3 font-medium">Responsable</th>
            <th className="pb-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => {
            const meta = CATEGORY_BY_KEY.get(a.category);
            return (
              <tr key={a.id} className={`border-b last:border-0 ${a.status === "inactivo" ? "opacity-50" : ""}`}>
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={() => setPhotoTarget(a)}
                    title="Cambiar foto"
                    className="flex size-10 items-center justify-center overflow-hidden rounded-lg border bg-muted hover:border-[#04B1AF]"
                  >
                    {a.photoDriveId && a.photoItemId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/servicios-generales/asset-photo/${a.photoDriveId}/${a.photoItemId}`}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageOff className="size-4 text-muted-foreground" />
                    )}
                  </button>
                </td>
                <td className="py-2 pr-3 font-medium text-foreground">{a.name}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${meta?.badgeClass ?? ""}`}>
                    <span className={`size-1.5 rounded-full ${meta?.dotClass ?? ""}`} />
                    {meta?.label ?? a.category}
                  </span>
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {[a.brand, a.spec].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {a.category === "vehiculos"
                    ? [a.licensePlate, a.currentMileage != null ? `${a.currentMileage.toLocaleString()} mi` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    : "—"}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{a.departmentName ?? "—"}</td>
                <td className="py-2 pr-3 text-muted-foreground">{a.assignedUserName ?? "—"}</td>
                <td className="py-2">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => setPhotoTarget(a)} className="gap-1.5">
                      <Camera className="size-3.5" />
                      Foto
                    </Button>
                    <AssetFormDialog asset={a} departments={departments} users={users} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => toggleStatus(a)}
                      className={a.status === "activo" ? "text-red-600" : "text-emerald-700"}
                    >
                      {a.status === "activo" ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <AssetPhotoUploadDialog asset={photoTarget} open={photoTarget !== null} onOpenChange={(o) => !o && setPhotoTarget(null)} />
    </div>
  );
}
