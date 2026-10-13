// Plain constants shared between the "use server" actions file and client
// components — kept out of actions.ts because a "use server" file may only
// export async functions.
export const STATUS_LABELS: Record<string, string> = {
  pendiente_aprobacion: "En revisión",
  aprobada: "Aprobada",
  editada_pendiente_reaprobacion: "Editada · Re-aprobación",
  rechazada: "Rechazada",
  en_preparacion: "En preparación",
  parcial: "Parcial",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

export const BOARD_STATUSES = [
  "pendiente_aprobacion",
  "aprobada",
  "editada_pendiente_reaprobacion",
  "rechazada",
  "en_preparacion",
  "parcial",
  "entregada",
  "cancelada",
] as const;
