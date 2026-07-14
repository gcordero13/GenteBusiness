import { describe, expect, it } from "vitest";
import { getUpcomingBirthdays, whatsappUrl } from "./contacts";

describe("getUpcomingBirthdays", () => {
  it("returns up to 5 contacts sorted by the nearest upcoming month/day", () => {
    const today = new Date("2026-07-14T00:00:00Z");
    const contacts = [
      { id: "1", name: "A", birth_date: "1990-07-20" },
      { id: "2", name: "B", birth_date: "1985-07-15" },
      { id: "3", name: "C", birth_date: "1992-08-01" },
      { id: "4", name: "D", birth_date: "1980-12-25" },
      { id: "5", name: "E", birth_date: "1975-01-05" },
      { id: "6", name: "F", birth_date: "1999-07-14" },
    ];

    const result = getUpcomingBirthdays(contacts, today, 5);

    expect(result.map((c) => c.id)).toEqual(["6", "2", "1", "3", "4"]);
  });

  it("wraps around the end of the year correctly", () => {
    const today = new Date("2026-12-20T00:00:00Z");
    const contacts = [
      { id: "1", name: "A", birth_date: "1990-01-05" },
      { id: "2", name: "B", birth_date: "1990-12-31" },
      { id: "3", name: "C", birth_date: "1990-06-01" },
    ];

    const result = getUpcomingBirthdays(contacts, today, 5);

    expect(result.map((c) => c.id)).toEqual(["2", "1", "3"]);
  });

  it("ignores contacts with no birth_date", () => {
    const today = new Date("2026-07-14T00:00:00Z");
    const contacts = [
      { id: "1", name: "A", birth_date: null },
      { id: "2", name: "B", birth_date: "1990-07-20" },
    ];

    const result = getUpcomingBirthdays(contacts, today, 5);

    expect(result.map((c) => c.id)).toEqual(["2"]);
  });

  it("returns an empty array when no contact has a birth_date", () => {
    const today = new Date("2026-07-14T00:00:00Z");
    const contacts = [{ id: "1", name: "A", birth_date: null }];

    expect(getUpcomingBirthdays(contacts, today, 5)).toEqual([]);
  });
});

describe("whatsappUrl", () => {
  it("strips non-digit characters and builds a wa.me link", () => {
    expect(whatsappUrl("+1 (555) 123-4567")).toBe("https://wa.me/15551234567");
  });

  it("handles an already-clean digit string", () => {
    expect(whatsappUrl("5215512345678")).toBe("https://wa.me/5215512345678");
  });
});
