import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DepartmentForm } from "./DepartmentForm";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  if (!flagsRows?.[0]?.can_manage_platform) {
    redirect("/");
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, companies(name)")
    .order("name");
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Departamentos</h1>
      <DepartmentForm companies={companies ?? []} />
      <ul className="space-y-1 text-sm">
        {(departments ?? []).map((d) => (
          <li key={d.id}>
            {d.name} — {(d.companies as unknown as { name: string })?.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
