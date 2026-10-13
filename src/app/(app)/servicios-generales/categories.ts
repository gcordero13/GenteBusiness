import { Bug, Building2, Car, Fan, Wrench } from "lucide-react";
import type { ComponentType } from "react";

// Fixed set, not admin-editable - a new category is a small code change
// since each one also carries an icon/color choice. Confirmed with the
// user from the reference mockup.
export type MaintenanceCategoryKey =
  | "aires_acondicionados"
  | "vehiculos"
  | "fumigacion"
  | "equipos_instalaciones"
  | "edificios_areas";

export interface MaintenanceCategoryMeta {
  key: MaintenanceCategoryKey;
  label: string;
  example: string;
  icon: ComponentType<{ className?: string }>;
  dotClass: string;
  badgeClass: string;
}

export const MAINTENANCE_CATEGORIES: MaintenanceCategoryMeta[] = [
  {
    key: "aires_acondicionados",
    label: "Aires Acondicionados",
    example: "Lavado, limpieza y revisión",
    icon: Fan,
    dotClass: "bg-[#04B1AF]",
    badgeClass: "bg-[#04B1AF]/10 text-[#04908F]",
  },
  {
    key: "vehiculos",
    label: "Vehículos",
    example: "Aceites, gomas, baterías y más",
    icon: Car,
    dotClass: "bg-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-700",
  },
  {
    key: "fumigacion",
    label: "Fumigación",
    example: "Control de plagas y sanitización",
    icon: Bug,
    dotClass: "bg-purple-500",
    badgeClass: "bg-purple-50 text-purple-700",
  },
  {
    key: "equipos_instalaciones",
    label: "Equipos e Instalaciones",
    example: "Eléctricos, computadoras, etc.",
    icon: Wrench,
    dotClass: "bg-amber-500",
    badgeClass: "bg-amber-50 text-amber-700",
  },
  {
    key: "edificios_areas",
    label: "Edificios y Áreas",
    example: "Limpieza y mantenimiento general",
    icon: Building2,
    dotClass: "bg-blue-500",
    badgeClass: "bg-blue-50 text-blue-700",
  },
];

export const CATEGORY_BY_KEY = new Map(MAINTENANCE_CATEGORIES.map((c) => [c.key, c]));

export const STATUS_LABELS: Record<string, string> = {
  programado: "Programado",
  completado: "Completado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};
