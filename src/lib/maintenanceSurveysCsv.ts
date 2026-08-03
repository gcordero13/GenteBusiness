export interface SurveyCsvRow {
  first_name: string;
  last_name: string;
  technician_name: string;
  quality_score: number | null;
  professionalism_score: number | null;
  clarity_score: number | null;
  satisfaction_score: number | null;
  comments: string | null;
  responded_at: string | null;
}

const HEADER = ["Usuario", "Técnico", "Calidad", "Profesionalismo", "Claridad", "Satisfacción", "Comentarios", "Respondida el"];

function csvField(value: string | number | null): string {
  const str = value === null ? "" : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildSurveysCsv(rows: SurveyCsvRow[]): string {
  const lines = [HEADER.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(`${r.first_name} ${r.last_name}`),
        csvField(r.technician_name),
        csvField(r.quality_score),
        csvField(r.professionalism_score),
        csvField(r.clarity_score),
        csvField(r.satisfaction_score),
        csvField(r.comments),
        csvField(r.responded_at),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}
