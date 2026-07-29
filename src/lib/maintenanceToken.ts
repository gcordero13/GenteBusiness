import { randomBytes } from "crypto";

export function generateMaintenanceToken(): string {
  return randomBytes(24).toString("base64url");
}
