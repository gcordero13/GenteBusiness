"use client";

import { useMemo, useState, useTransition } from "react";
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
import {
  MAINTENANCE_CATEGORIES,
  VEHICLE_SERVICE_TYPES,
  VEHICLE_SERVICE_TYPE_LABELS,
  VEHICLE_SERVICE_TRIGGER,
  type MaintenanceCategoryKey,
  type VehicleServiceType,
} from "./categories";
import { createMaintenanceRecord, type MaintenanceAssetRow, type MaintenanceVendorRow } from "./actions";

type FrequencyUnit = "dias" | "semanas" | "meses";

const FREQUENCY_LABELS: Record<FrequencyUnit, string> = { dias: "Días", semanas: "Semanas", meses: "Meses" };
const NO_ASSET_VALUE = "__none__";
const NO_VENDOR_VALUE = "__none__";

export function CreateMaintenanceDialog({
  departments,
  assets,
  vendors,
  forcePlan = false,
}: {
  departments: { id: string; name: string }[];
  assets: MaintenanceAssetRow[];
  vendors: MaintenanceVendorRow[];
  // "Planes de mantenimiento" reuses this same form, just always recurring
  // and without the toggle - a plan IS a recurring rule, so there's
  // nothing to opt into.
  forcePlan?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<MaintenanceCategoryKey>(MAINTENANCE_CATEGORIES[0].key);
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [assetId, setAssetId] = useState<string>(NO_ASSET_VALUE);
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [isRecurring, setIsRecurring] = useState(forcePlan);
  const [interval, setInterval] = useState(1);
  const [unit, setUnit] = useState<FrequencyUnit>("meses");
  const [vehicleServiceType, setVehicleServiceType] = useState<VehicleServiceType>("aceite");
  const [mileageAtService, setMileageAtService] = useState("");
  const [nextDueMileage, setNextDueMileage] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [cost, setCost] = useState("");
  const [vendorId, setVendorId] = useState(NO_VENDOR_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isVehicleCategory = category === "vehiculos";
  const assetsForCategory = useMemo(() => assets.filter((a) => a.category === category), [assets, category]);
  const selectedAsset = assetsForCategory.find((a) => a.id === assetId) ?? null;
  const trigger = VEHICLE_SERVICE_TRIGGER[vehicleServiceType];
  const showMileageFields = trigger === "millaje" || trigger === "ambos";
  const showDateField = trigger === "fecha" || trigger === "ambos";

  function reset() {
    setCategory(MAINTENANCE_CATEGORIES[0].key);
    setDepartmentId(departments[0]?.id ?? "");
    setAssetId(NO_ASSET_VALUE);
    setDescription("");
    setScheduledDate("");
    setScheduledTime("");
    setIsRecurring(forcePlan);
    setInterval(1);
    setUnit("meses");
    setVehicleServiceType("aceite");
    setMileageAtService("");
    setNextDueMileage("");
    setNextDueDate("");
    setCost("");
    setVendorId(NO_VENDOR_VALUE);
    setError(null);
  }

  // Picking an asset that already has a department pre-fills it - no need
  // to pick it twice (the asset already belongs to a department).
  function selectAsset(id: string) {
    setAssetId(id);
    const asset = assetsForCategory.find((a) => a.id === id);
    if (asset?.departmentId) setDepartmentId(asset.departmentId);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createMaintenanceRecord({
        category,
        departmentId,
        description,
        scheduledDate,
        scheduledTime: scheduledTime || undefined,
        recurring: isRecurring ? { interval, unit } : undefined,
        assetId: assetId === NO_ASSET_VALUE ? undefined : assetId,
        vehicleServiceType: isVehicleCategory ? vehicleServiceType : undefined,
        mileageAtService: isVehicleCategory && showMileageFields && mileageAtService ? Number(mileageAtService) : undefined,
        nextDueMileage: isVehicleCategory && showMileageFields && nextDueMileage ? Number(nextDueMileage) : undefined,
        nextDueDate: isVehicleCategory && showDateField && nextDueDate ? nextDueDate : undefined,
        cost: cost ? Number(cost) : undefined,
        vendorId: vendorId === NO_VENDOR_VALUE ? undefined : vendorId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        {forcePlan ? "Nuevo plan" : "Crear mantenimiento"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{forcePlan ? "Nuevo plan de mantenimiento" : "Nuevo mantenimiento"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Tipo de mantenimiento</label>
            <Select
              value={category}
              onValueChange={(v) => {
                if (!v) return;
                setCategory(v as MaintenanceCategoryKey);
                setAssetId(NO_ASSET_VALUE);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{() => MAINTENANCE_CATEGORIES.find((c) => c.key === category)?.label}</SelectValue>
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

          {assetsForCategory.length > 0 && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">
                {isVehicleCategory ? "Vehículo" : "Activo"}
              </label>
              <Select value={assetId} onValueChange={(v) => v && selectAsset(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => selectedAsset?.name ?? "Sin activo específico"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSET_VALUE}>Sin activo específico</SelectItem>
                  {assetsForCategory.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.licensePlate ? ` (${a.licensePlate})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Departamento / Área</label>
            <Select value={departmentId} onValueChange={(v) => v && setDepartmentId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => departments.find((d) => d.id === departmentId)?.name ?? "Selecciona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">
                {forcePlan ? "Fecha de inicio" : "Fecha programada"}
              </label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Hora (opcional)</label>
              <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
              placeholder="Describe el mantenimiento o la solicitud..."
            />
          </div>

          {isVehicleCategory && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-foreground">Detalle del vehículo</p>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Tipo de chequeo</label>
                <Select value={vehicleServiceType} onValueChange={(v) => v && setVehicleServiceType(v as VehicleServiceType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{() => VEHICLE_SERVICE_TYPE_LABELS[vehicleServiceType]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_SERVICE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {VEHICLE_SERVICE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {showMileageFields && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-muted-foreground">Kilometraje actual</label>
                    <Input
                      type="number"
                      min={0}
                      value={mileageAtService}
                      onChange={(e) => setMileageAtService(e.target.value)}
                      placeholder={selectedAsset?.currentMileage?.toString() ?? ""}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-muted-foreground">Próximo cambio (millas)</label>
                    <Input
                      type="number"
                      min={0}
                      value={nextDueMileage}
                      onChange={(e) => setNextDueMileage(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {showDateField && (
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-muted-foreground">Próximo vencimiento</label>
                  <Input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Monto gastado</label>
              <Input type="number" step="0.01" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Proveedor</label>
              <Select value={vendorId} onValueChange={(v) => v && setVendorId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => vendors.find((v) => v.id === vendorId)?.name ?? "Sin proveedor"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VENDOR_VALUE}>Sin proveedor</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!forcePlan && (
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
              ¿Se repite?
            </label>
          )}
          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Cada</label>
                <Input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-muted-foreground">Frecuencia</label>
                <Select value={unit} onValueChange={(v) => v && setUnit(v as FrequencyUnit)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{() => FREQUENCY_LABELS[unit]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dias">Días</SelectItem>
                    <SelectItem value="semanas">Semanas</SelectItem>
                    <SelectItem value="meses">Meses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
