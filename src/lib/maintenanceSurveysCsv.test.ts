import { describe, expect, it } from "vitest";
import { buildSurveysCsv } from "./maintenanceSurveysCsv";

describe("buildSurveysCsv", () => {
  it("builds a header row plus one row per survey", () => {
    const csv = buildSurveysCsv([
      {
        first_name: "Ana",
        last_name: "García",
        technician_name: "Luis Pérez",
        quality_score: 5,
        professionalism_score: 4,
        clarity_score: 5,
        satisfaction_score: 5,
        comments: "Muy buen servicio",
        responded_at: "2026-08-01T13:45:00+00:00",
      },
    ]);

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Usuario,Técnico,Calidad,Profesionalismo,Claridad,Satisfacción,Comentarios,Respondida el");
    expect(lines[1]).toBe(
      "Ana García,Luis Pérez,5,4,5,5,Muy buen servicio,2026-08-01T13:45:00+00:00",
    );
  });

  it("quotes and escapes fields containing commas, quotes, or newlines", () => {
    const csv = buildSurveysCsv([
      {
        first_name: "Ana",
        last_name: "García",
        technician_name: "Luis",
        quality_score: 5,
        professionalism_score: 5,
        clarity_score: 5,
        satisfaction_score: 5,
        comments: 'Excelente, "muy" profesional\ny puntual',
        responded_at: "2026-08-01T13:45:00+00:00",
      },
    ]);

    expect(csv).toContain('"Excelente, ""muy"" profesional\ny puntual"');
  });

  it("renders nulls as empty fields", () => {
    const csv = buildSurveysCsv([
      {
        first_name: "Ana",
        last_name: "García",
        technician_name: "Desconocido",
        quality_score: null,
        professionalism_score: null,
        clarity_score: null,
        satisfaction_score: null,
        comments: null,
        responded_at: null,
      },
    ]);

    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("Ana García,Desconocido,,,,,,");
  });

  it("returns just the header when there are no rows", () => {
    const csv = buildSurveysCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
  });
});
