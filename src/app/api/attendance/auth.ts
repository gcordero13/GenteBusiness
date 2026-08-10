import "server-only";
import type { NextRequest } from "next/server";

export function isAuthorizedAgentRequest(request: NextRequest): boolean {
  const secret = process.env.ATTENDANCE_AGENT_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
