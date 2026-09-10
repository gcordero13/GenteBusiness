"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateComplaintStatus } from "./actions";

const STATUS_OPTIONS = [
  { value: "nuevo", label: "Nuevo" },
  { value: "en_proceso", label: "En proceso" },
  { value: "resuelto", label: "Resuelto" },
  { value: "declinada", label: "Declinada" },
];

const STATUS_BADGE_CLASSNAME: Record<string, string> = {
  nuevo: "",
  en_proceso: "bg-amber-100 text-amber-900 border-amber-200",
  resuelto: "bg-emerald-100 text-emerald-900 border-emerald-200",
  declinada: "bg-red-100 text-red-900 border-red-200",
};

export interface ComplaintDetail {
  id: string;
  complaintNumber: number;
  createdAtLabel: string;
  categoryLabel: string;
  subject: string;
  message: string;
  submitterName: string | null;
  status: string;
  reviewerComment: string | null;
  hasPhoto: boolean;
}

export function ComplaintDetailDialog({
  complaint,
  open,
  onOpenChange,
}: {
  complaint: ComplaintDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState(complaint?.status ?? "nuevo");
  const [comment, setComment] = useState(complaint?.reviewerComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!complaint) return null;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateComplaintStatus(complaint!.id, status, comment);
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        onOpenChange(next);
        if (next) {
          setStatus(complaint.status);
          setComment(complaint.reviewerComment ?? "");
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Reporte #{complaint.complaintNumber} — {complaint.subject}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{complaint.createdAtLabel}</span>
            <Badge variant="outline">{complaint.categoryLabel}</Badge>
            <span>{complaint.submitterName ?? "Anónima"}</span>
          </div>
          <p className="whitespace-pre-wrap">{complaint.message}</p>
          {complaint.hasPhoto && (
            <img
              src={`/quejas/photo/${complaint.id}`}
              alt="Foto adjunta"
              className="max-h-64 rounded-md border object-contain"
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Estado</label>
            <div className="inline-flex rounded-lg border p-1">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={`rounded-md px-3 py-1.5 text-xs ${
                    status === option.value
                      ? `font-medium ${STATUS_BADGE_CLASSNAME[option.value] || "bg-muted"}`
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Comentario interno</label>
            <textarea
              className="w-full rounded-md border p-2 text-sm"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Notas internas de seguimiento..."
            />
          </div>
          <Button onClick={save} disabled={isPending}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
