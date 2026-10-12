"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Re-fetches the page's server data in place (router.refresh()) without a
// full navigation — confirmed with the user: a way to pull in new/updated
// tickets without leaving the module (losing the current tab/view state).
export function GoservicesRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      title="Actualizar"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
    </Button>
  );
}
