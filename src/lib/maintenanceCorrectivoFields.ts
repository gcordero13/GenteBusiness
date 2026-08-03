export const MAINTENANCE_CORRECTIVO_FIELDS = [
  { key: "problema_reportado", label: "Problema reportado" },
  { key: "diagnostico", label: "Diagnóstico" },
  { key: "solucion_aplicada", label: "Solución aplicada" },
  { key: "repuestos_piezas", label: "Repuestos/piezas usadas" },
] as const;

export type MaintenanceCorrectivoFieldKey = (typeof MAINTENANCE_CORRECTIVO_FIELDS)[number]["key"];
