import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyForm } from "./CompanyForm";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("*").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Empresas</h1>
      <CompanyForm />
      <ul className="space-y-1 text-sm">
        {(companies ?? []).map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
    </div>
  );
}
