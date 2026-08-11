import { describe, expect, it } from "bun:test";
import { renderMonitor } from "./monitor.ts";

describe("renderMonitor", () => {
  it("shows a placeholder line when there are no captured punches yet", () => {
    const output = renderMonitor({ recent: [], pendingCount: 0, deviceCount: 2, lastError: null });
    expect(output).toContain("Dispositivos registrados: 2");
    expect(output).toContain("(todavía no se ha capturado ningún ponche)");
  });

  it("marks a synced punch with a check and a pending one with an ellipsis", () => {
    const output = renderMonitor({
      recent: [
        { id: 1, deviceId: "d1", employeeNoString: "42", punchedAt: "2026-08-10T08:00:00.000Z", synced: true },
        { id: 2, deviceId: "d1", employeeNoString: "43", punchedAt: "2026-08-10T08:05:00.000Z", synced: false },
      ],
      pendingCount: 1,
      deviceCount: 1,
      lastError: null,
    });
    expect(output).toContain("[✓] 2026-08-10T08:00:00.000Z  empleado 42  (dispositivo d1)");
    expect(output).toContain("[…] 2026-08-10T08:05:00.000Z  empleado 43  (dispositivo d1)");
  });

  it("shows the last error when present", () => {
    const output = renderMonitor({ recent: [], pendingCount: 0, deviceCount: 0, lastError: "device unreachable" });
    expect(output).toContain("Último error: device unreachable");
  });
});
