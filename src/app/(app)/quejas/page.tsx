import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComplaintsSummaryCards } from "./ComplaintsSummaryCards";
import { ComplaintsCategoryChart } from "./ComplaintsCategoryChart";
import { ComplaintsFilterBar } from "./ComplaintsFilterBar";
import { ComplaintsList, type ComplaintRow } from "./ComplaintsList";

const CATEGORY_LABELS: Record<string, string> = {
  acoso: "Acoso",
  seguridad: "Seguridad",
  etica: "Ética",
  recursos_humanos: "Recursos Humanos",
  otro: "Otro",
};

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string }>;
}) {
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("can_view_complaints");
  if (!canView) {
    redirect("/");
  }

  const { data: complaintsRows } = await supabase
    .from("complaints")
    .select("id, created_at, category, message, is_anonymous, contact_id, contacts(first_name, last_name)")
    .order("created_at", { ascending: false });

  const allComplaints = complaintsRows ?? [];

  const summary = {
    total: allComplaints.length,
    anonymous: allComplaints.filter((c) => c.is_anonymous).length,
    named: allComplaints.filter((c) => !c.is_anonymous).length,
  };

  const categoryCounts = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    category: value,
    label,
    count: allComplaints.filter((c) => c.category === value).length,
  }));

  const params = await searchParams;
  const filtered = allComplaints.filter((c) => {
    if (params.category && c.category !== params.category) return false;
    if (params.search && !c.message.toLowerCase().includes(params.search.toLowerCase())) return false;
    return true;
  });

  const rows: ComplaintRow[] = filtered.map((c) => {
    const contact = c.contacts as unknown as { first_name: string; last_name: string } | null;
    return {
      id: c.id,
      createdAtLabel: new Date(c.created_at).toLocaleDateString("es-DO", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      categoryLabel: CATEGORY_LABELS[c.category] ?? c.category,
      message: c.message,
      submitterName: c.is_anonymous || !contact ? null : `${contact.first_name} ${contact.last_name}`,
    };
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Quejas y reportes</h1>
        <p className="text-sm text-muted-foreground">Solo tú puedes ver esta información.</p>
      </div>
      <ComplaintsSummaryCards summary={summary} />
      <ComplaintsCategoryChart counts={categoryCounts} />
      <ComplaintsFilterBar category={params.category ?? null} search={params.search ?? ""} />
      <ComplaintsList rows={rows} />
    </div>
  );
}
