"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { requestSupplyException, type ApproverOption } from "./actions";

// Lets a requester who already used their one request this month ask for a
// second one — confirmed with the user: it goes to an approver (from the
// same org-chart chain) with a note, and only once granted can they create
// another request for that period.
export function RequestExceptionDialog({ approvers }: { approvers: ApproverOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [approverId, setApproverId] = useState(approvers[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await requestSupplyException(approverId, note);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setSuccess(false);
          setNote("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-800 hover:bg-amber-100"
          />
        }
      >
        Solicitar excepción (fuera de tiempo)
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar excepción</DialogTitle>
        </DialogHeader>
        {success ? (
          <p className="text-sm text-emerald-700">
            Enviada. Cuando tu aprobador la autorice, podrás crear otra solicitud este mes.
          </p>
        ) : (
          <div className="space-y-3">
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-sm text-muted-foreground">
              Explica por qué necesitas una solicitud adicional este mes. Se enviará a quien elijas abajo.
            </p>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">¿A quién se envía?</label>
              <Select value={approverId} onValueChange={(v) => v && setApproverId(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{() => approvers.find((a) => a.id === approverId)?.name ?? "Selecciona"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {approvers.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-muted-foreground">Motivo</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
                placeholder="Ej. Se dañó el equipo antes de tiempo y necesito..."
              />
            </div>
          </div>
        )}
        {!success && (
          <DialogFooter>
            <Button
              onClick={submit}
              disabled={isPending || !approverId || !note.trim()}
              className="w-full bg-[#04B1AF] text-white hover:bg-[#04B1AF]/90"
            >
              Enviar excepción
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
