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

// Only meaningful for the 'vehiculos' category - confirmed with the user
// as the fixed list, with 'otro' as the free-text escape hatch for
// anything else ("existen muchas formas... entre otras cosas"). Replaced
// 'inspeccion_matricula' (not needed) with 'marbete' (vehicle
// registration/tax renewal sticker), per the user.
export type VehicleServiceType =
  | "aceite"
  | "gomas"
  | "bateria"
  | "frenos"
  | "filtro_aire"
  | "filtro_combustible"
  | "marbete"
  | "seguro"
  | "otro";

export const VEHICLE_SERVICE_TYPE_LABELS: Record<VehicleServiceType, string> = {
  aceite: "Cambio de aceite",
  gomas: "Gomas",
  bateria: "Batería",
  frenos: "Frenos",
  filtro_aire: "Filtro de aire",
  filtro_combustible: "Filtro de combustible",
  marbete: "Marbete",
  seguro: "Seguro",
  otro: "Otro",
};

export const VEHICLE_SERVICE_TYPES = Object.keys(VEHICLE_SERVICE_TYPE_LABELS) as VehicleServiceType[];

// Which input to show when logging this type of check: a wear item
// (aceite/gomas/frenos/filtros) tracks mileage; a batería, el seguro, y el
// marbete vencen por tiempo (confirmed with the user - "por el tiempo que
// tiene el equipo"), not by mileage; 'otro' shows both since it could be
// either.
export type VehicleServiceTrigger = "millaje" | "fecha" | "ambos";

export const VEHICLE_SERVICE_TRIGGER: Record<VehicleServiceType, VehicleServiceTrigger> = {
  aceite: "millaje",
  gomas: "millaje",
  bateria: "fecha",
  frenos: "millaje",
  filtro_aire: "millaje",
  filtro_combustible: "millaje",
  marbete: "fecha",
  seguro: "fecha",
  otro: "ambos",
};
