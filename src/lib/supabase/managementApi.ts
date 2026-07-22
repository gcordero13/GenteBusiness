import "server-only";

const BASE_URL = "https://api.supabase.com/v1/projects";

function projectRef(): string {
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!ref) throw new Error("SUPABASE_PROJECT_REF is not set");
  return ref;
}

function accessToken(): string {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is not set");
  return token;
}

/**
 * Thin wrapper around the Supabase Management API, used for project-level
 * settings (like Auth SMTP config) that aren't reachable through the regular
 * data API. Requires a personal access token with management scope — never
 * import this from client code.
 */
export async function getAuthConfig(): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/${projectRef()}/config/auth`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to read auth config: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function updateAuthConfig(patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE_URL}/${projectRef()}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`Failed to update auth config: ${res.status} ${await res.text()}`);
  }
}
