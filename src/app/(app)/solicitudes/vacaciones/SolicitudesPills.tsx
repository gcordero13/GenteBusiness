import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MoreHorizontal,
  Plane,
  Stethoscope,
  User,
  Users,
  XCircle,
} from "lucide-react";

export const STATUS_LABEL: Record<string, string> = {
  pendiente_supervisor: "Pendiente del jefe directo",
  pendiente_rrhh: "Pendiente de RRHH",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

export const TIPO_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  personal: "Personal",
  familiar: "Familiar",
  medico: "Médico",
  perdida: "Pérdida",
  tramites: "Trámites",
  otro: "Otro",
};

const TIPO_PILL: Record<string, { icon: typeof Plane; className: string }> = {
  vacaciones: { icon: Plane, className: "bg-blue-50 text-blue-700" },
  personal: { icon: User, className: "bg-violet-50 text-violet-700" },
  familiar: { icon: Users, className: "bg-pink-50 text-pink-700" },
  medico: { icon: Stethoscope, className: "bg-red-50 text-red-700" },
  perdida: { icon: AlertTriangle, className: "bg-slate-100 text-slate-700" },
  tramites: { icon: FileText, className: "bg-amber-50 text-amber-700" },
  otro: { icon: MoreHorizontal, className: "bg-slate-100 text-slate-700" },
};

const ESTADO_PILL: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  aprobado: { icon: CheckCircle2, className: "bg-green-50 text-green-700" },
  rechazado: { icon: XCircle, className: "bg-red-50 text-red-700" },
  pendiente_supervisor: { icon: Clock, className: "bg-amber-50 text-amber-700" },
  pendiente_rrhh: { icon: Clock, className: "bg-amber-50 text-amber-700" },
};

export function TipoPill({ tipo }: { tipo: string }) {
  const pill = TIPO_PILL[tipo] ?? { icon: MoreHorizontal, className: "bg-slate-100 text-slate-700" };
  const Icon = pill.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pill.className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

export function EstadoPill({ status }: { status: string }) {
  const pill = ESTADO_PILL[status] ?? { icon: Clock, className: "bg-slate-100 text-slate-700" };
  const Icon = pill.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pill.className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
