import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "../ContactForm";

export default async function NewContactPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });
  if (!flagsRows?.[0]?.can_add) {
    redirect("/contacts");
  }

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name")
    .order("first_name");

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-xl font-semibold">Nuevo contacto</h1>
      <ContactForm
        companies={companies ?? []}
        departments={departments ?? []}
        supervisors={(existingContacts ?? []).map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
        }))}
      />
    </div>
  );
}
