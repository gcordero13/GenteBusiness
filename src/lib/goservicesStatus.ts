export type GoservicesStatus = "recibido" | "en_proceso" | "finalizado_ejecutor" | "completado" | "cancelado";

export const STATUS_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  finalizado_ejecutor: "Finalizado por ejecutor",
  completado: "Completado",
  cancelado: "Cancelado",
};
