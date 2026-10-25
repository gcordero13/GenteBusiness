"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { addDepartmentLeader, removeDepartmentLeader, type AssignableAppUser } from "./actions";

export function LeaderFormDialog({
  users,
  departments,
}: {
  users: AssignableAppUser[];
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [appUserId, setAppUserId] = useState(users[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addDepartmentLeader(appUserId, departmentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-2 bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90" />}>
        <Plus className="size-4" />
        Asignar líder
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar líder de departamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Persona</label>
            <Select value={appUserId} onValueChange={(v) => v && setAppUserId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => users.find((u) => u.id === appUserId)?.name ?? "Selecciona"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Departamento</label>
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

export function RemoveLeaderButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      await removeDepartmentLeader(id);
      router.refresh();
    });
  }

  return (
    <Button size="icon-sm" variant="outline" disabled={isPending} onClick={remove} className="text-red-600">
      <X className="size-3.5" />
    </Button>
  );
}
