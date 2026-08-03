import { describe, expect, it, vi } from "vitest";
import { resolveVacationSupervisor } from "./resolveVacationSupervisor";

function mockAdmin({
  contact = null,
  supervisorContact = null,
  supervisorUser = null,
}: {
  contact?: Record<string, unknown> | null;
  supervisorContact?: Record<string, unknown> | null;
  supervisorUser?: Record<string, unknown> | null;
} = {}) {
  let call = 0;
  return {
    from: vi.fn((table: string) => {
      if (table === "contacts") {
        call += 1;
        const data = call === 1 ? contact : supervisorContact;
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data }) }) }) };
      }
      if (table === "app_users") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: supervisorUser }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

describe("resolveVacationSupervisor", () => {
  it("rejects when the requester has no matching contact", async () => {
    const result = await resolveVacationSupervisor(mockAdmin() as never, "ana@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("No se encontró tu contacto");
  });

  it("rejects when the contact has no reports_to_id", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({ contact: { id: "c1", first_name: "Ana", last_name: "García", position: null, reports_to_id: null, companies: null, departments: null } }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("jefe directo asignado");
  });

  it("rejects when the supervisor contact has no email", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({
        contact: { id: "c1", first_name: "Ana", last_name: "García", position: null, reports_to_id: "c2", companies: null, departments: null },
        supervisorContact: { email: null },
      }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no tiene un correo registrado");
  });

  it("rejects when the supervisor has no active app_user account", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({
        contact: { id: "c1", first_name: "Ana", last_name: "García", position: null, reports_to_id: "c2", companies: null, departments: null },
        supervisorContact: { email: "jefe@example.com" },
        supervisorUser: null,
      }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("cuenta activa");
  });

  it("rejects when the supervisor's account is deactivated", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({
        contact: { id: "c1", first_name: "Ana", last_name: "García", position: null, reports_to_id: "c2", companies: null, departments: null },
        supervisorContact: { email: "jefe@example.com" },
        supervisorUser: { id: "sup-1", status: "deactivated" },
      }) as never,
      "ana@example.com",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("cuenta activa");
  });

  it("resolves successfully when every link in the chain is valid", async () => {
    const result = await resolveVacationSupervisor(
      mockAdmin({
        contact: {
          id: "c1",
          first_name: "Ana",
          last_name: "García",
          position: "Analista",
          reports_to_id: "c2",
          companies: { name: "Sanchez Business Corp" },
          departments: { name: "TI" },
        },
        supervisorContact: { email: "jefe@example.com" },
        supervisorUser: { id: "sup-1", status: "active" },
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
        supervisorAppUserId: "sup-1",
      });
    }
  });
});
