import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

export interface RequesterContactInfo {
  contactId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  companyName: string | null;
  departmentName: string | null;
  reportsToId: string | null;
}

type ResolveRequesterResult = { ok: true; data: RequesterContactInfo } | { ok: false; error: string };

export async function resolveRequesterContact(
  admin: ReturnType<typeof createAdminClient>,
  requesterEmail: string,
): Promise<ResolveRequesterResult> {
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name, position, reports_to_id, companies(name), departments(name)")
    .eq("email", requesterEmail)
    .maybeSingle();

  if (!contact) {
    return { ok: false, error: "No se encontró tu contacto en la Agenda. Pide a un administrador que lo cree con tu correo." };
  }

  return {
    ok: true,
    data: {
      contactId: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      position: contact.position,
      companyName: (contact.companies as unknown as { name: string } | null)?.name ?? null,
      departmentName: (contact.departments as unknown as { name: string } | null)?.name ?? null,
      reportsToId: contact.reports_to_id,
    },
  };
}

export interface SupervisorChainOption {
  contactId: string;
  appUserId: string;
  firstName: string;
  lastName: string;
}

// Caps how far up the org chart we'll walk, as a guard against a
// corrupted/circular reports_to_id chain - not a realistic org depth.
const MAX_CHAIN_LEVELS = 8;

// Walks the org chart upward from the requester's direct reports_to_id,
// collecting every ancestor who has an active app_user account - so the
// requester can choose an alternate approver (e.g. their boss's boss) when
// whoever is immediately above them is on leave/permiso. Ancestors without
// an active account are skipped (they can't approve anything) but the walk
// keeps climbing past them.
export async function resolveSupervisorChain(
  admin: ReturnType<typeof createAdminClient>,
  startContactId: string | null,
): Promise<SupervisorChainOption[]> {
  const options: SupervisorChainOption[] = [];
  const visited = new Set<string>();
  let currentId = startContactId;

  for (let level = 0; level < MAX_CHAIN_LEVELS && currentId; level++) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const { data: ancestor } = await admin
      .from("contacts")
      .select("id, first_name, last_name, email, reports_to_id")
      .eq("id", currentId)
      .maybeSingle();
    if (!ancestor) break;

    if (ancestor.email) {
      const { data: ancestorUser } = await admin
        .from("app_users")
        .select("id, status")
        .eq("email", ancestor.email)
        .maybeSingle();
      if (ancestorUser && ancestorUser.status === "active") {
        options.push({
          contactId: ancestor.id,
          appUserId: ancestorUser.id,
          firstName: ancestor.first_name,
          lastName: ancestor.last_name,
        });
      }
    }

    currentId = ancestor.reports_to_id;
  }

  return options;
}
