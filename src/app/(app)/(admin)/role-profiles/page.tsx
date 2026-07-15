import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleProfileForm } from "./RoleProfileForm";

export default async function RoleProfilesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: profiles } = await supabase.from("role_profiles").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Perfiles de rol</h1>
      <RoleProfileForm />
      <ul className="space-y-2">
        {(profiles ?? []).map((profile) => (
          <li key={profile.id} className="rounded border p-3 text-sm">
            <strong>{profile.name}</strong>: ver={String(profile.can_view)}, agregar=
            {String(profile.can_add)}, editar={String(profile.can_edit)}, eliminar=
            {String(profile.can_delete)}, anular={String(profile.can_deactivate)}, gestiona=
            {String(profile.can_manage_platform)}
          </li>
        ))}
      </ul>
    </div>
  );
}
