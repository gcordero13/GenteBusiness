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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAINTENANCE_CATEGORIES, type MaintenanceCategoryKey } from "../categories";
import {
  createMaintenanceAsset,
  updateMaintenanceAsset,
  type MaintenanceAssetInput,
  type MaintenanceAssetRow,
  type AssignableAppUser,
} from "../actions";

const EMPTY: MaintenanceAssetInput = {
  category: MAINTENANCE_CATEGORIES[0].key,
  name: "",
  brand: "",
  spec: "",
  licensePlate: "",
  currentMileage: null,
  departmentId: "",
  assignedAppUserId: "",
};

const NONE_VALUE = "__none__";

export function AssetFormDialog({
  asset,
  departments,
  users,
}: {
  asset?: MaintenanceAssetRow;
  departments: { id: string; name: string }[];
  users: AssignableAppUser[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MaintenanceAssetInput>(
    asset
      ? {
          category: asset.category,
          name: asset.name,
          brand: asset.brand ?? "",
          spec: asset.spec ?? "",
          licensePlate: asset.licensePlate ?? "",
          currentMileage: asset.currentMileage,
          departmentId: asset.departmentId ?? "",
          assignedAppUserId: asset.assignedAppUserId ?? "",
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isVehicle = form.category === "vehiculos";

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = asset ? await updateMaintenanceAsset(asset.id, form) : await createMaintenanceAsset(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (!asset) setForm(EMPTY);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          asset ? (
            <Button variant="outline" size="sm" />
          ) : (
            <Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />
          )
        }
      >
        {asset ? (
          "Editar"
        ) : (
          <>
            <Plus className="size-4" />
            Nuevo activo
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{asset ? `Editar ${asset.name}` : "Nuevo activo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Categoría</label>
            <Select
              value={form.category}
              onValueChange={(v) => v && setForm({ ...form, category: v as MaintenanceCategoryKey })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{() => MAINTENANCE_CATEGORIES.find((c) => c.key === form.category)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Nombre del artículo</label>
            <Input
              placeholder={isVehicle ? "Ej. Toyota Hilux 2020" : "Ej. A/C Sala de Juntas"}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Marca</label>
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">
                {isVehicle ? "Modelo / especificación" : "Especificación (ej. BTU)"}
              </label>
              <Input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} />
            </div>
          </div>

          {isVehicle && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Placa</label>
                <Input
                  value={form.licensePlate}
                  onChange={(e) => setForm({ ...form, licensePlate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Kilometraje actual</label>
                <Input
                  type="number"
                  min={0}
                  value={form.currentMileage ?? ""}
                  onChange={(e) => setForm({ ...form, currentMileage: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Departamento / Área</label>
            <Select
              value={form.departmentId || NONE_VALUE}
              onValueChange={(v) => setForm({ ...form, departmentId: !v || v === NONE_VALUE ? "" : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {() => departments.find((d) => d.id === form.departmentId)?.name ?? "Sin asignar"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sin asignar</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Responsable asignado</label>
            <Select
              value={form.assignedAppUserId || NONE_VALUE}
              onValueChange={(v) => setForm({ ...form, assignedAppUserId: !v || v === NONE_VALUE ? "" : v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {() => users.find((u) => u.id === form.assignedAppUserId)?.name ?? "Sin asignar"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sin asignar</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar activo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
