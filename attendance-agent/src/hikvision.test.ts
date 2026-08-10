import { describe, expect, it } from "vitest";
import { parseAcsEventResponse } from "./hikvision.js";

describe("parseAcsEventResponse", () => {
  it("extracts employee number and ISO punch time from a typical AcsEvent response", () => {
    const fixture = {
      AcsEvent: {
        searchID: "abc",
        responseStatusStrg: "OK",
        numOfMatches: 1,
        totalMatches: 1,
        InfoList: [
          {
            major: 5,
            minor: 75,
            time: "2026-08-10T08:03:12-04:00",
            employeeNoString: "42",
            name: "Juan Perez",
          },
        ],
      },
    };

    const punches = parseAcsEventResponse(fixture);

    expect(punches).toEqual([
      {
        employeeNoString: "42",
        punchedAt: new Date("2026-08-10T08:03:12-04:00").toISOString(),
        rawEventId: "42-2026-08-10T08:03:12-04:00",
      },
    ]);
  });

  it("skips entries with no employeeNoString (e.g. door-open events unrelated to a person)", () => {
    const fixture = {
      AcsEvent: {
        InfoList: [{ major: 5, minor: 38, time: "2026-08-10T08:00:00-04:00" }],
      },
    };

    expect(parseAcsEventResponse(fixture)).toEqual([]);
  });

  it("returns an empty array when InfoList is missing entirely (no events in range)", () => {
    expect(parseAcsEventResponse({ AcsEvent: { searchID: "abc", numOfMatches: 0 } })).toEqual([]);
  });
});
