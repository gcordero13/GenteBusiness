"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteIconButton({
  confirmMessage,
  action,
}: {
  confirmMessage: string;
  action: () => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="icon-sm" onClick={handleDelete} disabled={isPending} title="Eliminar">
      <Trash2 className="size-4" />
    </Button>
  );
}
