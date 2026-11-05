"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MoreHorizontal,
  Paperclip,
  Plane,
  Stethoscope,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequestFlowDialog } from "./RequestFlowDialog";
import { VacationRequestActions } from "./VacationRequestActions";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";

const STATUS_LABEL: Record<string, string> = {
  pendiente_supervisor: "Pendiente del jefe directo",
  pendiente_rrhh: "Pendiente de RRHH",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
};

const TIPO_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  personal: "Personal",
  familiar: "Familiar",
  medico: "Médico",
  perdida: "Pérdida",
  tramites: "Trámites",
  otro: "Otro",
};

const ALL_VALUE = "__all__";

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

function TipoPill({ tipo }: { tipo: string }) {
  const pill = TIPO_PILL[tipo] ?? { icon: MoreHorizontal, className: "bg-slate-100 text-slate-700" };
  const Icon = pill.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pill.className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

function EstadoPill({ status }: { status: string }) {
  const pill = ESTADO_PILL[status] ?? { icon: Clock, className: "bg-slate-100 text-slate-700" };
  const Icon = pill.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pill.className}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export interface SolicitudRequestRow {
  id: string;
  first_name: string;
  last_name: string;
  tipo: string;
  period: string | null;
  date_from: string;
  date_to: string;
  status: string;
  supervisor_app_user_id: string;
  created_at: string;
  supervisor_decision: string | null;
  supervisor_decided_at: string | null;
  supervisor_comments: string | null;
  rrhh_decision: string | null;
  rrhh_decided_at: string | null;
  rrhh_comments: string | null;
  rrhh_period_confirmed: string | null;
  rrhh_has_current_vacation: boolean | null;
  rrhh_is_advance: boolean | null;
}

interface SolicitudesTableProps {
  requests: SolicitudRequestRow[];
  attachmentUrlByRequestId: Record<string, string>;
  signatures: SignatureWithUrl[];
  userId: string;
  canAuthorize: boolean;
}

export function SolicitudesTable({
  requests,
  attachmentUrlByRequestId,
  signatures,
  userId,
  canAuthorize,
}: SolicitudesTableProps) {
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState(ALL_VALUE);
  const [estadoFilter, setEstadoFilter] = useState(ALL_VALUE);

  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay solicitudes todavía.</p>;
  }

  const searchTokens = normalizeForSearch(search.trim()).split(/\s+/).filter(Boolean);
  const filtered = requests.filter((r) => {
    if (tipoFilter !== ALL_VALUE && r.tipo !== tipoFilter) return false;
    if (estadoFilter !== ALL_VALUE && r.status !== estadoFilter) return false;
    if (searchTokens.length > 0) {
      const fullName = normalizeForSearch(`${r.first_name} ${r.last_name}`);
      if (!searchTokens.every((token) => fullName.includes(token))) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por colaborador..."
          className="w-64"
          aria-label="Buscar por colaborador"
        />
        <Select value={tipoFilter} onValueChange={(value) => value && setTipoFilter(value)}>
          <SelectTrigger className="w-48" aria-label="Filtrar por tipo">
            <SelectValue>
              {(value: string) => (value === ALL_VALUE ? "Todos los tipos" : (TIPO_LABEL[value] ?? value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los tipos</SelectItem>
            {Object.entries(TIPO_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={estadoFilter} onValueChange={(value) => value && setEstadoFilter(value)}>
          <SelectTrigger className="w-56" aria-label="Filtrar por estado">
            <SelectValue>
              {(value: string) => (value === ALL_VALUE ? "Todos los estados" : (STATUS_LABEL[value] ?? value))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Todos los estados</SelectItem>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay solicitudes que coincidan con el filtro.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Adjunto</TableHead>
              <TableHead />
              <TableHead>Flujo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const isPendingSupervisorForMe = r.status === "pendiente_supervisor" && r.supervisor_app_user_id === userId;
              const isPendingRrhhForMe = r.status === "pendiente_rrhh" && canAuthorize;
              const attachmentUrl = attachmentUrlByRequestId[r.id];
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.first_name} {r.last_name}
                  </TableCell>
                  <TableCell>
                    <TipoPill tipo={r.tipo} />
                  </TableCell>
                  <TableCell>{r.period ?? "-"}</TableCell>
                  <TableCell>
                    {r.date_from} → {r.date_to}
                  </TableCell>
                  <TableCell>
                    <EstadoPill status={r.status} />
                  </TableCell>
                  <TableCell>
                    {attachmentUrl ? (
                      <a
                        href={attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-teal-100"
                      >
                        <Paperclip className="size-3.5" aria-hidden="true" />
                        Ver documento
                      </a>
                    ) : (
                      <span className="text-sm text-neutral-400" aria-hidden="true">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isPendingSupervisorForMe && (
                      <VacationRequestActions requestId={r.id} role="supervisor" signatures={signatures} tipo={r.tipo} />
                    )}
                    {isPendingRrhhForMe && (
                      <VacationRequestActions requestId={r.id} role="rrhh" signatures={signatures} tipo={r.tipo} />
                    )}
                  </TableCell>
                  <TableCell>
                    <RequestFlowDialog request={r} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
