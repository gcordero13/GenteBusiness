"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
  listAssignableUsers,
  listProyectoCompartidos,
  listTareaCompartidos,
  revokeProyectoShare,
  revokeTareaShare,
  shareProyecto,
  shareTarea,
  type AssignableUser,
  type CompartidoRow,
} from "./actions";

interface CompartirDialogProps {
  proyectoId?: string;
  tareaId?: string;
  parentProyectoId: string;
}

export function CompartirDialog({ proyectoId, tareaId, parentProyectoId }: CompartirDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [shares, setShares] = useState<CompartidoRow[]>([]);
  const [userId, setUserId] = useState("");
  const [accessLevel, setAccessLevel] = useState<"ver" | "editar">("ver");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listAssignableUsers().then(setUsers);
    if (proyectoId) listProyectoCompartidos(proyectoId).then(setShares);
    if (tareaId) listTareaCompartidos(tareaId).then(setShares);
  }, [open, proyectoId, tareaId]);

  function add() {
    if (!userId) return;
    setError(null);
    startTransition(async () => {
      const result = proyectoId
        ? await shareProyecto(proyectoId, userId, accessLevel)
        : await shareTarea(tareaId!, parentProyectoId, userId, accessLevel);
      if (result.error) {
        setError(result.error);
        return;
      }
      setShares(proyectoId ? await listProyectoCompartidos(proyectoId) : await listTareaCompartidos(tareaId!));
      router.refresh();
    });
  }

  function revoke(shareId: string) {
    startTransition(async () => {
      if (proyectoId) {
        await revokeProyectoShare(shareId, proyectoId);
        setShares(await listProyectoCompartidos(proyectoId));
      } else {
        await revokeTareaShare(shareId, parentProyectoId);
        setShares(await listTareaCompartidos(tareaId!));
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1.5" />}>
        <Share2 className="size-3.5" />
        Compartir
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Compartir</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {shares.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border p-2 text-xs">
              <span>
                {s.userName} · <span className="font-semibold">{s.accessLevel === "editar" ? "Editar" : "Ver"}</span>
              </span>
              <Button size="icon-sm" variant="ghost" disabled={isPending} onClick={() => revoke(s.id)}>
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-muted-foreground">Persona</label>
            <Select value={userId} onValueChange={(v) => v && setUserId(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => users.find((u) => u.id === userId)?.name ?? "Selecciona"}</SelectValue>
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
            <label className="block text-xs font-semibold text-muted-foreground">Nivel de acceso</label>
            <Select value={accessLevel} onValueChange={(v) => v && setAccessLevel(v as "ver" | "editar")}>
              <SelectTrigger className="w-full">
                <SelectValue>{() => (accessLevel === "editar" ? "Editar" : "Ver")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ver">Ver</SelectItem>
                <SelectItem value="editar">Editar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={isPending || !userId} className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90">
            Compartir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
