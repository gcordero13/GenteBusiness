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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveRoleProfile, type ModulePermissionInput, type RoleProfileInput } from "./actions";

interface Module {
  id: string;
  key: string;
  label: string;
}

const PERMISSION_COLUMNS: { key: keyof Omit<ModulePermissionInput, "module_id">; label: string }[] = [
  { key: "can_view", label: "Ver" },
  { key: "can_add", label: "Agregar" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Eliminar" },
  { key: "can_deactivate", label: "Anular" },
  { key: "can_manage", label: "Gestionar" },
  { key: "can_authorize", label: "Autorizar" },
];

function emptyPermissions(modules: Module[]): Record<string, ModulePermissionInput> {
  return Object.fromEntries(
    modules.map((m) => [
      m.id,
      {
        module_id: m.id,
        can_view: false,
        can_add: false,
        can_edit: false,
        can_delete: false,
        can_deactivate: false,
        can_manage: false,
        can_authorize: false,
      },
    ]),
  );
}

export function RoleProfileForm({
  modules,
  initial,
}: {
  modules: Module[];
  initial?: RoleProfileInput;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [permissions, setPermissions] = useState<Record<string, ModulePermissionInput>>(() => {
    const base = emptyPermissions(modules);
    for (const p of initial?.permissions ?? []) {
      base[p.module_id] = { ...base[p.module_id], ...p };
    }
    return base;
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(moduleId: string, key: keyof Omit<ModulePermissionInput, "module_id">, value: boolean) {
    setPermissions((prev) => ({ ...prev, [moduleId]: { ...prev[moduleId], [key]: value } }));
  }

  function submit() {
    startTransition(async () => {
      const result = await saveRoleProfile({
        id: initial?.id,
        name,
        permissions: Object.values(permissions),
      });
      setError(result.error ?? null);
      if (!result.error) {
        if (!initial) setName("");
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
            <Button>Nuevo perfil</Button>
          )
        }
      />
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar perfil de rol" : "Nuevo perfil de rol"}</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                {PERMISSION_COLUMNS.map((col) => (
                  <TableHead key={col.key} className="text-center">
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  {PERMISSION_COLUMNS.map((col) => (
                    <TableCell key={col.key} className="text-center">
                      <input
                        type="checkbox"
                        checked={permissions[m.id]?.[col.key] ?? false}
                        onChange={(e) => toggle(m.id, col.key, e.target.checked)}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !name}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
