import { describe, expect, it, vi } from "vitest";
import { resolveRequesterContact, resolveSupervisorChain } from "./resolveVacationSupervisor";

describe("resolveRequesterContact", () => {
  function mockAdmin(contact: Record<string, unknown> | null) {
    return {
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: contact }) }) }) })),
    };
  }

  it("rejects when the requester has no matching contact", async () => {
    const result = await resolveRequesterContact(mockAdmin(null) as never, "ana@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No se encontró tu contacto");
  });

  it("resolves the requester's own contact info, including a null reports_to_id", async () => {
    const result = await resolveRequesterContact(
      mockAdmin({
        id: "c1",
        first_name: "Ana",
        last_name: "García",
        position: "Analista",
        reports_to_id: null,
        companies: { name: "Sanchez Business Corp" },
        departments: { name: "TI" },
      }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        contactId: "c1",
        firstName: "Ana",
        lastName: "García",
        position: "Analista",
        companyName: "Sanchez Business Corp",
        departmentName: "TI",
        reportsToId: null,
      });
    }
  });
});

describe("resolveSupervisorChain", () => {
  function mockAdmin(contactsById: Record<string, Record<string, unknown> | undefined>, usersByEmail: Record<string, Record<string, unknown> | undefined>) {
    return {
      from: vi.fn((table: string) => {
        if (table === "contacts") {
          return {
            select: () => ({
              eq: (_col: string, id: string) => ({ maybeSingle: () => Promise.resolve({ data: contactsById[id] ?? null }) }),
            }),
          };
        }
        if (table === "app_users") {
          return {
            select: () => ({
              eq: (_col: string, email: string) => ({ maybeSingle: () => Promise.resolve({ data: usersByEmail[email] ?? null }) }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };
  }

  it("returns an empty list when startContactId is null", async () => {
    const result = await resolveSupervisorChain(mockAdmin({}, {}) as never, null);
    expect(result).toEqual([]);
  });

  it("returns the direct supervisor when they have an active account", async () => {
    const admin = mockAdmin(
      { boss: { id: "boss", first_name: "Carlos", last_name: "Jefe", email: "carlos@example.com", reports_to_id: null } },
      { "carlos@example.com": { id: "sup-1", status: "active" } },
    );
    const result = await resolveSupervisorChain(admin as never, "boss");
    expect(result).toEqual([{ contactId: "boss", appUserId: "sup-1", firstName: "Carlos", lastName: "Jefe" }]);
  });

  it("skips an ancestor with no active account but keeps climbing to the next one", async () => {
    const admin = mockAdmin(
      {
        boss: { id: "boss", first_name: "Carlos", last_name: "Jefe", email: "carlos@example.com", reports_to_id: "grandboss" },
        grandboss: { id: "grandboss", first_name: "María", last_name: "Gómez", email: "maria@example.com", reports_to_id: null },
      },
      {
        "carlos@example.com": { id: "sup-1", status: "deactivated" },
        "maria@example.com": { id: "sup-2", status: "active" },
      },
    );
    const result = await resolveSupervisorChain(admin as never, "boss");
    expect(result).toEqual([{ contactId: "grandboss", appUserId: "sup-2", firstName: "María", lastName: "Gómez" }]);
  });

  it("stops when it hits a circular reports_to_id chain instead of looping forever", async () => {
    const admin = mockAdmin(
      {
        a: { id: "a", first_name: "A", last_name: "A", email: "a@example.com", reports_to_id: "b" },
        b: { id: "b", first_name: "B", last_name: "B", email: "b@example.com", reports_to_id: "a" },
      },
      {
        "a@example.com": { id: "user-a", status: "active" },
        "b@example.com": { id: "user-b", status: "active" },
      },
    );
    const result = await resolveSupervisorChain(admin as never, "a");
    expect(result).toEqual([
      { contactId: "a", appUserId: "user-a", firstName: "A", lastName: "A" },
      { contactId: "b", appUserId: "user-b", firstName: "B", lastName: "B" },
    ]);
  });
});
