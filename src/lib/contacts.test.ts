import { describe, expect, it } from "vitest";
import { buildOrgTree, escapeIlikePattern, getUpcomingBirthdays, whatsappUrl } from "./contacts";

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

describe("escapeIlikePattern", () => {
  it("wraps a plain search term in a quoted ilike wildcard pattern", () => {
    expect(escapeIlikePattern("ana")).toBe('"%ana%"');
  });

  it("escapes double quotes and backslashes so they can't break out of the PostgREST filter", () => {
    expect(escapeIlikePattern('a"b\\c')).toBe('"%a\\"b\\\\c%"');
  });

  it("keeps commas and parentheses harmless by keeping them inside the quoted value", () => {
    expect(escapeIlikePattern("a,b(c)")).toBe('"%a,b(c)%"');
  });
});

describe("buildOrgTree", () => {
  it("nests a simple chain of supervisors", () => {
    const contacts = [
      { id: "a", name: "Ana (CEO)", position: "CEO", reports_to_id: null },
      { id: "b", name: "Beto (Gerente)", position: "Gerente", reports_to_id: "a" },
      { id: "c", name: "Carla (Analista)", position: "Analista", reports_to_id: "b" },
    ];

    const tree = buildOrgTree(contacts);

    expect(tree).toHaveLength(1);
    expect(tree[0].contact.id).toBe("a");
    expect(tree[0].reports).toHaveLength(1);
    expect(tree[0].reports[0].contact.id).toBe("b");
    expect(tree[0].reports[0].reports).toHaveLength(1);
    expect(tree[0].reports[0].reports[0].contact.id).toBe("c");
  });

  it("supports multiple roots when several contacts have no supervisor", () => {
    const contacts = [
      { id: "a", name: "Ana", position: null, reports_to_id: null },
      { id: "b", name: "Beto", position: null, reports_to_id: null },
    ];

    const tree = buildOrgTree(contacts);

    expect(tree.map((n) => n.contact.id).sort()).toEqual(["a", "b"]);
  });

  it("treats a contact whose supervisor is not in the list as a root", () => {
    const contacts = [
      { id: "a", name: "Ana", position: null, reports_to_id: "ghost-id-not-present" },
    ];

    const tree = buildOrgTree(contacts);

    expect(tree).toHaveLength(1);
    expect(tree[0].contact.id).toBe("a");
  });

  it("does not infinite-loop on a cyclic reports_to_id (defensive, shouldn't happen via the UI)", () => {
    const contacts = [
      { id: "a", name: "Ana", position: null, reports_to_id: "b" },
      { id: "b", name: "Beto", position: null, reports_to_id: "a" },
    ];

    expect(() => buildOrgTree(contacts)).not.toThrow();
  });
});
