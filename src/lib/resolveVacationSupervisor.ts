import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

export interface ResolvedVacationSupervisor {
  contactId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  companyName: string | null;
  departmentName: string | null;
  supervisorAppUserId: string;
}

type ResolveResult = { ok: true; data: ResolvedVacationSupervisor } | { ok: false; error: string };

export async function resolveVacationSupervisor(
  admin: ReturnType<typeof createAdminClient>,
  requesterEmail: string,
): Promise<ResolveResult> {
  const { data: contact } = await admin
    .from("contacts")
    .select("id, first_name, last_name, position, reports_to_id, companies(name), departments(name)")
    .eq("email", requesterEmail)
    .maybeSingle();

  if (!contact) {
    return { ok: false, error: "No se encontró tu contacto en la Agenda. Pide a un administrador que lo cree con tu correo." };
  }
  if (!contact.reports_to_id) {
    return {
      ok: false,
      error: "No tienes un jefe directo asignado en tu ficha de contacto. Pide a un administrador que lo asigne antes de enviar una solicitud.",
    };
  }

  const { data: supervisorContact } = await admin
    .from("contacts")
    .select("email")
    .eq("id", contact.reports_to_id)
    .maybeSingle();

  if (!supervisorContact?.email) {
    return { ok: false, error: "Tu jefe directo no tiene un correo registrado en la Agenda. Pide a un administrador que lo corrija." };
  }

  const { data: supervisorUser } = await admin
    .from("app_users")
    .select("id, status")
    .eq("email", supervisorContact.email)
    .maybeSingle();

  if (!supervisorUser || supervisorUser.status !== "active") {
    return { ok: false, error: "Tu jefe directo no tiene una cuenta activa en el sistema. Pide a un administrador que la habilite." };
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
      supervisorAppUserId: supervisorUser.id,
    },
  };
}
