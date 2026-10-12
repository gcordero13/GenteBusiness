"use client";

import { useState } from "react";
import { GoservicesFilterBar } from "./GoservicesFilterBar";
import { GoservicesViewSwitcher } from "../solicitudes/goservices/GoservicesViewSwitcher";
import {
  GoservicesTicketExplorer,
  type GoservicesExplorerMode,
  type ViewMode,
} from "../solicitudes/goservices/GoservicesTicketExplorer";
import type { GoservicesRequestRow } from "../solicitudes/goservices/actions";

// Keeps the type filter and the Lista/Tablero/Tabla switcher on one row
// (confirmed with the user — pushes the actual ticket content higher up,
// instead of each control eating its own row) while keeping view-mode as
// cheap client state, so switching views never re-fetches data from the
// server the way changing the type filter does.
export function GoservicesGestionView({
  type,
  requests,
  mode,
}: {
  type: string | null;
  requests: GoservicesRequestRow[];
  mode: GoservicesExplorerMode;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GoservicesFilterBar type={type} />
        <GoservicesViewSwitcher value={viewMode} onChange={setViewMode} />
      </div>
      <GoservicesTicketExplorer requests={requests} mode={mode} viewMode={viewMode} />
    </div>
  );
}
