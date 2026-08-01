import { describe, expect, it } from "vitest";
import { computeAverageSatisfactionByTechnician, computeQuestionAverages } from "./maintenanceSurveys";

describe("computeAverageSatisfactionByTechnician", () => {
  it("averages scores per technician and ignores unanswered surveys", () => {
    const result = computeAverageSatisfactionByTechnician([
      { technician_id: "t1", technician_name: "Luis", satisfaction_score: 5 },
      { technician_id: "t1", technician_name: "Luis", satisfaction_score: 4 },
      { technician_id: "t2", technician_name: "María", satisfaction_score: 5 },
      { technician_id: "t2", technician_name: "María", satisfaction_score: null },
    ]);

    expect(result).toEqual([
      { technician_id: "t2", technician_name: "María", average: 5, responses: 1 },
      { technician_id: "t1", technician_name: "Luis", average: 4.5, responses: 2 },
    ]);
  });

  it("returns an empty array when there are no answered surveys", () => {
    expect(computeAverageSatisfactionByTechnician([])).toEqual([]);
  });
});

describe("computeQuestionAverages", () => {
  it("averages each question independently and ignores unanswered fields", () => {
    const result = computeQuestionAverages([
      { quality_score: 5, professionalism_score: 4, clarity_score: 5, satisfaction_score: 5 },
      { quality_score: 3, professionalism_score: null, clarity_score: 4, satisfaction_score: 4 },
    ]);

    expect(result).toEqual([
      { key: "quality_score", label: "Calidad", average: 4, responses: 2 },
      { key: "professionalism_score", label: "Profesionalismo", average: 4, responses: 1 },
      { key: "clarity_score", label: "Claridad", average: 4.5, responses: 2 },
      { key: "satisfaction_score", label: "Satisfacción", average: 4.5, responses: 2 },
    ]);
  });

  it("returns zero averages with no responses when the list is empty", () => {
    expect(computeQuestionAverages([])).toEqual([
      { key: "quality_score", label: "Calidad", average: 0, responses: 0 },
      { key: "professionalism_score", label: "Profesionalismo", average: 0, responses: 0 },
      { key: "clarity_score", label: "Claridad", average: 0, responses: 0 },
      { key: "satisfaction_score", label: "Satisfacción", average: 0, responses: 0 },
    ]);
  });
});
