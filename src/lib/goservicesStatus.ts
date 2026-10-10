export type GoservicesStatus = "recibido" | "en_proceso" | "finalizado_ejecutor" | "completado" | "cancelado";

export const STATUS_LABELS: Record<string, string> = {
  recibido: "Recibido",
  en_proceso: "En proceso",
  finalizado_ejecutor: "Finalizado por ejecutor",
  completado: "Completado",
  cancelado: "Cancelado",
};

export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  recibido: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", dot: "bg-sky-500" },
  en_proceso: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  finalizado_ejecutor: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", dot: "bg-violet-500" },
  completado: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  cancelado: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", dot: "bg-rose-500" },
};
