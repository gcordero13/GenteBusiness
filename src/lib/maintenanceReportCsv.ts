export interface MaintenanceReportRow {
  type: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  department_name: string | null;
  technician_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  email: string | null;
  position: string | null;
  host_name: string | null;
  ram: string | null;
  os: string | null;
  storage_total: string | null;
  storage_used: string | null;
  storage_free: string | null;
  checklist: Record<string, boolean | null>;
  correctivo: Record<string, string | null>;
  findings: string | null;
  observations: string | null;
  technician_signed_at: string | null;
  user_signed_at: string | null;
  survey_completed: boolean;
  quality_score: number | null;
  professionalism_score: number | null;
  clarity_score: number | null;
  satisfaction_score: number | null;
  survey_comments: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  completado: "Completado",
  expirado: "Expirado",
};

const TYPE_LABEL: Record<string, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
};

function csvField(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function joinRow(fields: (string | number | boolean | null | undefined)[]): string {
  return fields.map(csvField).join(",");
}

function boolLabel(value: boolean | null): string {
  if (value === null || value === undefined) return "N/A";
  return value ? "Sí" : "No";
}

export function buildMaintenanceBasicCsv(rows: MaintenanceReportRow[]): string {
  const lines = [
    joinRow(["Usuario", "Tipo", "Empresa", "Técnico", "Estado", "Fecha de creación", "Departamento", "Encuesta completada"]),
  ];
  for (const r of rows) {
    lines.push(
      joinRow([
        `${r.first_name} ${r.last_name}`,
        TYPE_LABEL[r.type] ?? r.type,
        r.company_name,
        r.technician_name,
        STATUS_LABEL[r.status] ?? r.status,
        r.created_at,
        r.department_name,
        r.survey_completed ? "Sí" : "No",
      ]),
    );
  }
  return lines.join("\r\n");
}

export function buildMaintenanceDetailedCsv(
  rows: MaintenanceReportRow[],
  checklistItems: readonly { key: string; label: string }[],
  correctivoFields: readonly { key: string; label: string }[],
): string {
  const header = [
    "Usuario",
    "Tipo",
    "Correo",
    "Posición",
    "Empresa",
    "Departamento",
    "Técnico",
    "Estado",
    "Fecha de creación",
    "Fecha de completado",
    "Nombre del Host",
    "Memoria RAM",
    "Sistema Operativo",
    "Almacenamiento Total",
    "Almacenamiento Utilizado",
    "Almacenamiento Libre",
    ...checklistItems.map((i) => i.label),
    ...correctivoFields.map((f) => f.label),
    "Hallazgos",
    "Observaciones",
    "Firma Técnico",
    "Firma Usuario",
    "Encuesta completada",
    "Calidad",
    "Profesionalismo",
    "Claridad",
    "Satisfacción",
    "Comentarios de encuesta",
  ];
  const lines = [joinRow(header)];
  for (const r of rows) {
    lines.push(
      joinRow([
        `${r.first_name} ${r.last_name}`,
        TYPE_LABEL[r.type] ?? r.type,
        r.email,
        r.position,
        r.company_name,
        r.department_name,
        r.technician_name,
        STATUS_LABEL[r.status] ?? r.status,
        r.created_at,
        r.completed_at,
        r.host_name,
        r.ram,
        r.os,
        r.storage_total,
        r.storage_used,
        r.storage_free,
        ...checklistItems.map((i) => boolLabel(r.checklist[i.key] ?? null)),
        ...correctivoFields.map((f) => r.correctivo[f.key] ?? ""),
        r.findings,
        r.observations,
        r.technician_signed_at,
        r.user_signed_at,
        r.survey_completed ? "Sí" : "No",
        r.quality_score,
        r.professionalism_score,
        r.clarity_score,
        r.satisfaction_score,
        r.survey_comments,
      ]),
    );
  }
  return lines.join("\r\n");
}
