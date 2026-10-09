export type GoservicesStatus = "recibido" | "en_proceso" | "completado" | "cancelado";

export const STATUS_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  completado: "Completado",
  cancelado: "Cancelado",
};
