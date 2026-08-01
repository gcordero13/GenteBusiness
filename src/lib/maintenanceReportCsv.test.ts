import { describe, expect, it } from "vitest";
import { buildMaintenanceBasicCsv, buildMaintenanceDetailedCsv, type MaintenanceReportRow } from "./maintenanceReportCsv";

const CHECKLIST_ITEMS = [
  { key: "restore_point_created", label: "Punto de restauración creado" },
  { key: "temp_files_cleaned", label: "Limpieza de archivos temporales" },
];

function baseRow(overrides: Partial<MaintenanceReportRow> = {}): MaintenanceReportRow {
  return {
    first_name: "Ana",
    last_name: "García",
    company_name: "Sanchez Business Corp",
    department_name: "TI",
    technician_name: "Luis Pérez",
    status: "completado",
    created_at: "2026-07-28T10:00:00+00:00",
    completed_at: "2026-07-28T11:00:00+00:00",
    email: "ana@example.com",
    position: "Analista",
    host_name: "DESKTOP-ANA",
    ram: "16 GB",
    os: "Windows 11",
    storage_total: "512 GB",
    storage_used: "200 GB",
    storage_free: "312 GB",
    checklist: { restore_point_created: true, temp_files_cleaned: false },
    findings: "Ninguno",
    observations: "Ninguna",
    technician_signed_at: "2026-07-28T10:50:00+00:00",
    user_signed_at: "2026-07-28T11:00:00+00:00",
    survey_completed: true,
    quality_score: 5,
    professionalism_score: 4,
    clarity_score: 5,
    satisfaction_score: 5,
    survey_comments: "Muy bien",
    ...overrides,
  };
}

describe("buildMaintenanceBasicCsv", () => {
  it("includes exactly the requested columns in order", () => {
    const csv = buildMaintenanceBasicCsv([baseRow()]);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe("Usuario,Empresa,Técnico,Estado,Fecha de creación,Departamento,Encuesta completada");
    expect(lines[1]).toBe(
      "Ana García,Sanchez Business Corp,Luis Pérez,Completado,2026-07-28T10:00:00+00:00,TI,Sí",
    );
  });

  it("shows 'No' when the survey has not been completed", () => {
    const csv = buildMaintenanceBasicCsv([baseRow({ survey_completed: false })]);
    expect(csv.split("\r\n")[1]).toContain(",No");
  });

  it("returns just the header when there are no rows", () => {
    expect(buildMaintenanceBasicCsv([]).split("\r\n")).toHaveLength(1);
  });
});

describe("buildMaintenanceDetailedCsv", () => {
  it("includes equipment, checklist, findings, signatures, and survey columns", () => {
    const csv = buildMaintenanceDetailedCsv([baseRow()], CHECKLIST_ITEMS);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe(
      [
        "Usuario",
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
        "Punto de restauración creado",
        "Limpieza de archivos temporales",
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
      ].join(","),
    );
    expect(lines[1]).toBe(
      "Ana García,ana@example.com,Analista,Sanchez Business Corp,TI,Luis Pérez,Completado,2026-07-28T10:00:00+00:00,2026-07-28T11:00:00+00:00,DESKTOP-ANA,16 GB,Windows 11,512 GB,200 GB,312 GB,Sí,No,Ninguno,Ninguna,2026-07-28T10:50:00+00:00,2026-07-28T11:00:00+00:00,Sí,5,4,5,5,Muy bien",
    );
  });

  it("renders N/A for a null checklist value and empty fields for nulls", () => {
    const csv = buildMaintenanceDetailedCsv(
      [baseRow({ checklist: { restore_point_created: null, temp_files_cleaned: false }, findings: null, quality_score: null })],
      CHECKLIST_ITEMS,
    );
    const cells = csv.split("\r\n")[1]!.split(",");
    expect(cells).toContain("N/A");
  });
});
