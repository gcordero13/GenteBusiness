import "server-only";
import { headers } from "next/headers";

/**
 * Derives the current site's origin from the incoming request instead of a
 * fixed env var, so links (like password-reset emails) always point at
 * wherever the app is actually running — localhost, a Vercel preview, or
 * production — without needing per-environment configuration.
 */
export async function getSiteUrl(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");

  if (host) {
    const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
