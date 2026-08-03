import { describe, expect, it } from "vitest";
import { MAINTENANCE_CORRECTIVO_FIELDS } from "./maintenanceCorrectivoFields";

describe("MAINTENANCE_CORRECTIVO_FIELDS", () => {
  it("has exactly the 4 fields confirmed for the Correctivo form, in order", () => {
    expect(MAINTENANCE_CORRECTIVO_FIELDS.map((f) => f.key)).toEqual([
      "problema_reportado",
      "diagnostico",
      "solucion_aplicada",
      "repuestos_piezas",
    ]);
  });

  it("has a non-empty Spanish label for every field", () => {
    for (const field of MAINTENANCE_CORRECTIVO_FIELDS) {
      expect(field.label.length).toBeGreaterThan(0);
    }
  });
});
