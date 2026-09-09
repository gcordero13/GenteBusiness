"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { MyComplaintRow } from "./actions";

export function MyComplaintDetailDialog({
  complaint,
  open,
  onOpenChange,
}: {
  complaint: MyComplaintRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!complaint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Queja #{complaint.complaintNumber} — {complaint.subject}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{complaint.createdAtLabel}</span>
            <Badge variant="outline">{complaint.categoryLabel}</Badge>
            <Badge variant="outline">{complaint.statusLabel}</Badge>
            {complaint.isAnonymous && <Badge variant="outline">Anónima</Badge>}
          </div>
          <p className="whitespace-pre-wrap">{complaint.message}</p>
          {complaint.hasPhoto && (
            <img
              src={`/quejas/photo/${complaint.id}`}
              alt="Foto adjunta"
              className="max-h-64 rounded-md border object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
