import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "../ContactForm";
import { setContactStatus, deleteContact } from "../actions";
import { Button } from "@/components/ui/button";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    redirect("/");
  }

  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).single();
  if (!contact) notFound();

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .neq("id", id)
    .order("first_name");

  async function toggleStatus() {
    "use server";
    await setContactStatus(id, contact!.status === "active" ? "deactivated" : "active");
  }

  async function remove() {
    "use server";
    await deleteContact(id);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">Editar contacto</h1>
      {flags.can_edit ? (
        <ContactForm
          companies={companies ?? []}
          departments={departments ?? []}
          supervisors={(existingContacts ?? []).map((c) => ({
            id: c.id,
            name: `${c.first_name} ${c.last_name}`,
          }))}
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
            reports_to_id: contact.reports_to_id ?? "",
            photo_url: contact.photo_url ?? "",
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No tienes permiso para editar este contacto.
        </p>
      )}
      <div className="flex gap-2">
        {flags.can_deactivate && (
          <form action={toggleStatus}>
            <Button type="submit" variant="outline">
              {contact.status === "active" ? "Anular" : "Reactivar"}
            </Button>
          </form>
        )}
        {flags.can_delete && (
          <form action={remove}>
            <Button type="submit" variant="destructive">
              Eliminar permanentemente
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
