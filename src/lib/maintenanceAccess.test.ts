import { describe, expect, it } from "vitest";
import { isMaintenanceLinkExpired } from "./maintenanceAccess";

describe("isMaintenanceLinkExpired", () => {
  it("returns false when now is before expiresAt", () => {
    const expiresAt = new Date("2026-08-27T00:00:00Z").toISOString();
    const now = new Date("2026-07-28T00:00:00Z");
    expect(isMaintenanceLinkExpired(expiresAt, now)).toBe(false);
  });

  it("returns true when now is after expiresAt", () => {
    const expiresAt = new Date("2026-07-01T00:00:00Z").toISOString();
    const now = new Date("2026-07-28T00:00:00Z");
    expect(isMaintenanceLinkExpired(expiresAt, now)).toBe(true);
  });
});
