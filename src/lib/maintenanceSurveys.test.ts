import { describe, expect, it } from "vitest";
import { computeAverageSatisfactionByTechnician } from "./maintenanceSurveys";

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
