import { describe, expect, it } from "vitest";
import { computeAverageNpsByTechnician } from "./maintenanceSurveys";

describe("computeAverageNpsByTechnician", () => {
  it("averages scores per technician and ignores unanswered surveys", () => {
    const result = computeAverageNpsByTechnician([
      { technician_id: "t1", technician_name: "Luis", nps_score: 9 },
      { technician_id: "t1", technician_name: "Luis", nps_score: 7 },
      { technician_id: "t2", technician_name: "María", nps_score: 10 },
      { technician_id: "t2", technician_name: "María", nps_score: null },
    ]);

    expect(result).toEqual([
      { technician_id: "t2", technician_name: "María", average: 10, responses: 1 },
      { technician_id: "t1", technician_name: "Luis", average: 8, responses: 2 },
    ]);
  });

  it("returns an empty array when there are no answered surveys", () => {
    expect(computeAverageNpsByTechnician([])).toEqual([]);
  });
});
