import { describe, expect, it } from "vitest";
import { generateMaintenanceToken } from "./maintenanceToken";

describe("generateMaintenanceToken", () => {
  it("returns a url-safe string long enough to resist guessing", () => {
    const token = generateMaintenanceToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(30);
  });

  it("returns a different value on each call", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateMaintenanceToken()));
    expect(tokens.size).toBe(1000);
  });
});
