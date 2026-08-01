export interface SurveyForAverage {
  technician_id: string;
  technician_name: string;
  satisfaction_score: number | null;
}

export interface TechnicianSatisfactionAverage {
  technician_id: string;
  technician_name: string;
  average: number;
  responses: number;
}

export function computeAverageSatisfactionByTechnician(surveys: SurveyForAverage[]): TechnicianSatisfactionAverage[] {
  const groups = new Map<string, { name: string; total: number; count: number }>();
  for (const s of surveys) {
    if (s.satisfaction_score === null) continue;
    const entry = groups.get(s.technician_id) ?? { name: s.technician_name, total: 0, count: 0 };
    entry.total += s.satisfaction_score;
    entry.count += 1;
    groups.set(s.technician_id, entry);
  }
  return Array.from(groups.entries())
    .map(([technician_id, { name, total, count }]) => ({
      technician_id,
      technician_name: name,
      average: Math.round((total / count) * 10) / 10,
      responses: count,
    }))
    .sort((a, b) => b.average - a.average);
}

export interface SurveyScores {
  quality_score: number | null;
  professionalism_score: number | null;
  clarity_score: number | null;
  satisfaction_score: number | null;
}

export interface QuestionAverage {
  key: keyof SurveyScores;
  label: string;
  average: number;
  responses: number;
}

const QUESTION_LABELS: Record<keyof SurveyScores, string> = {
  quality_score: "Calidad",
  professionalism_score: "Profesionalismo",
  clarity_score: "Claridad",
  satisfaction_score: "Satisfacción",
};

export function computeQuestionAverages(surveys: SurveyScores[]): QuestionAverage[] {
  return (Object.keys(QUESTION_LABELS) as (keyof SurveyScores)[]).map((key) => {
    const values = surveys.map((s) => s[key]).filter((v): v is number => v !== null);
    const average = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;
    return { key, label: QUESTION_LABELS[key], average, responses: values.length };
  });
}
