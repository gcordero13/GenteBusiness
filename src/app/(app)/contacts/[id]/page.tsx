import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContactForm } from "../ContactForm";
import { SelfEditForm } from "../SelfEditForm";
import { GoservicesEjecutorTypeSelect } from "../GoservicesEjecutorTypeSelect";
import { setContactStatus, deleteContact } from "../actions";
import { Button } from "@/components/ui/button";
import { FirmasCorreo } from "../firmas/FirmasCorreo";
import { plantillaDeEmpresa, type Plantilla } from "../firmas/firmaDatos";
import { FUENTES_FIRMA } from "../firmas/fuentes";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });
  const flags = flagsRows?.[0];

  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).single();
  if (!contact) notFound();

  const isSelf = Boolean(user?.email && contact.email && user.email === contact.email);

  if (!flags?.can_view && !isSelf) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("id, name, logo_url, firma_fondo_url, firma_fondo_sin_foto_url, firma_plantilla").order("name");

  // Email signature: the person's own (Mi perfil), or anyone's for whoever
  // can edit or manage contacts (user request, 2026-11-27) - it only shows
  // Agenda data they already see.
  const verFirma = isSelf || Boolean(flags?.can_edit || flags?.can_manage);
  const empresa = (companies ?? []).find((c) => c.id === contact.company_id) ?? null;
  // The design chosen in Empresas, or the one matching the company's name.
  const plantilla = (empresa?.firma_plantilla as Plantilla | null) ?? plantillaDeEmpresa(empresa?.name);
  const empresaGrupo = (companies ?? []).find((c) => plantillaDeEmpresa(c.name) === "sbc" && c.logo_url) ?? null;
  const logosGrupo = (companies ?? [])
    .filter((c) => c.logo_url && c.id !== empresa?.id && plantillaDeEmpresa(c.name) !== "sbc")
    .map((c) => c.logo_url as string);
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, company_id")
    .order("name");
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .neq("id", id)
    .order("first_name");
  const { data: schedules } = await supabase.from("schedule_templates").select("id, name").order("name");

  // Shown only when this contact's platform account is GoServices
  // ejecutor-eligible (can_manage) — resolved by email since contacts and
  // app_users are separate tables.
  let goservicesAppUser: { id: string; goservices_ejecutor_type: string | null } | null = null;
  if (flags?.can_edit && contact.email) {
    const admin = createAdminClient();
    const { data: appUser } = await admin
      .from("app_users")
      .select("id, role_profile_id, goservices_ejecutor_type")
      .eq("email", contact.email)
      .maybeSingle();
    if (appUser) {
      const { data: goservicesModule } = await admin.from("modules").select("id").eq("key", "goservices").single();
      const { data: perm } = goservicesModule
        ? await admin
            .from("role_profile_permissions")
            .select("can_manage")
            .eq("module_id", goservicesModule.id)
            .eq("role_profile_id", appUser.role_profile_id)
            .maybeSingle()
        : { data: null };
      if (perm?.can_manage) {
        goservicesAppUser = { id: appUser.id, goservices_ejecutor_type: appUser.goservices_ejecutor_type };
      }
    }
  }

  async function toggleStatus() {
    "use server";
    await setContactStatus(id, contact!.status === "active" ? "deactivated" : "active");
  }

  async function remove() {
    "use server";
    await deleteContact(id);
  }

  return (
    // The person's data on the left and their signature on the right
    // (user request, 2026-11-27); stacked on smaller screens.
    <div
      className={`mx-auto w-full min-w-0 p-4 sm:p-6 ${
        verFirma
          ? "max-w-7xl space-y-8 xl:grid xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start xl:gap-8 xl:space-y-0"
          : "max-w-md"
      }`}
    >
      <div className="mx-auto w-full max-w-md space-y-6 xl:mx-0">
      <h1 className="text-xl font-semibold">{isSelf ? "Mi perfil" : "Editar contacto"}</h1>
      {flags?.can_edit ? (
        <ContactForm
          companies={companies ?? []}
          departments={departments ?? []}
          supervisors={(existingContacts ?? []).map((c) => ({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
          }))}
          schedules={schedules ?? []}
          initial={{
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email ?? "",
            extension: contact.extension ?? "",
            fleet_phone: contact.fleet_phone ?? "",
            has_whatsapp: contact.has_whatsapp,
            company_id: contact.company_id ?? "",
            department_id: contact.department_id ?? "",
            position: contact.position ?? "",
            birth_date: contact.birth_date ?? "",
            hire_date: contact.hire_date ?? "",
            hikvision_employee_no: contact.hikvision_employee_no ?? "",
            schedule_id: contact.schedule_id ?? "",
            reports_to_id: contact.reports_to_id ?? "",
            photo_url: contact.photo_url ?? "",
          }}
        />
      ) : isSelf ? (
        <SelfEditForm
          initial={{
            id: contact.id,
            position: contact.position ?? "",
            fleet_phone: contact.fleet_phone ?? "",
            extension: contact.extension ?? "",
            has_whatsapp: contact.has_whatsapp,
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">No tienes permiso para editar este contacto.</p>
      )}
      {goservicesAppUser && (
        <GoservicesEjecutorTypeSelect
          appUserId={goservicesAppUser.id}
          currentType={goservicesAppUser.goservices_ejecutor_type as "mantenimiento" | "mensajeria" | null}
        />
      )}
      <div className="flex gap-2">
        {flags?.can_deactivate && (
          <form action={toggleStatus}>
            <Button type="submit" variant="outline">
              {contact.status === "active" ? "Anular" : "Reactivar"}
            </Button>
          </form>
        )}
        {flags?.can_delete && (
          <form action={remove}>
            <Button type="submit" variant="destructive">
              Eliminar permanentemente
            </Button>
          </form>
        )}
      </div>
    </div>

      {verFirma && (
        <div className="min-w-0 xl:sticky xl:top-6">
        <FirmasCorreo
          persona={{
            nombre: contact.first_name,
            apellido: contact.last_name,
            puesto: contact.position,
            email: contact.email,
            extension: contact.extension,
            celular: contact.fleet_phone,
            tieneWhatsapp: contact.has_whatsapp,
            fotoUrl: contact.photo_url,
          }}
          plantilla={plantilla}
          fondo={empresa?.firma_fondo_url ?? null}
          fondoSinFoto={empresa?.firma_fondo_sin_foto_url ?? null}
          fuentes={FUENTES_FIRMA}
          propia={isSelf}
          logoEmpresa={empresa?.logo_url ?? null}
          logoGrupo={empresaGrupo?.logo_url ?? null}
          logosGrupo={logosGrupo}
        />
        </div>
      )}
    </div>
  );
}
