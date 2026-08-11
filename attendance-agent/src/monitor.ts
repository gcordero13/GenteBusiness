import type { StoredPunch } from "./db.ts";

export interface MonitorState {
  recent: StoredPunch[];
  pendingCount: number;
  deviceCount: number;
  lastError: string | null;
}

export function renderMonitor(state: MonitorState): string {
  const lines: string[] = [];
  lines.push("=== Agente de Asistencia - Sanchez Business & Corp ===");
  lines.push(`Dispositivos registrados: ${state.deviceCount}`);
  lines.push(`Ponches pendientes de sincronizar: ${state.pendingCount}`);
  if (state.lastError) {
    lines.push(`Último error: ${state.lastError}`);
  }
  lines.push("");
  lines.push("Últimos ponches:");
  if (state.recent.length === 0) {
    lines.push("  (todavía no se ha capturado ningún ponche)");
  } else {
    for (const punch of state.recent) {
      const mark = punch.synced ? "✓" : "…";
      lines.push(`  [${mark}] ${punch.punchedAt}  empleado ${punch.employeeNoString}  (dispositivo ${punch.deviceId})`);
    }
  }
  return lines.join("\n");
}

export function draw(output: string): void {
  console.clear();
  console.log(output);
}
