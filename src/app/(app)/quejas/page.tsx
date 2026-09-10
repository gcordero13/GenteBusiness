import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComplaintsSummaryCards } from "./ComplaintsSummaryCards";
import { ComplaintsCategoryChart } from "./ComplaintsCategoryChart";
import { ComplaintsFilterBar } from "./ComplaintsFilterBar";
import { ComplaintsList, type ComplaintRow } from "./ComplaintsList";

const CATEGORY_LABELS: Record<string, string> = {
  etica: "Ética",
  malas_practicas: "Malas Prácticas",
  conflicto_interes: "Conflicto de Interés",
  maltrato_acoso: "Maltrato o Acoso",
  seguridad: "Situaciones de Seguridad",
  otros: "Otros",
};

const STATUS_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  en_proceso: "En proceso",
  resuelto: "Resuelto",
  declinada: "Declinada",
};

const STATUS_ORDER = ["nuevo", "en_proceso", "resuelto", "declinada"];

export default async function ComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; search?: string; status?: string }>;
}) {
  const supabase = await createClient();
  const { data: canView } = await supabase.rpc("can_view_complaints");
  if (!canView) {
    redirect("/");
  }

  const { data: complaintsRows } = await supabase
    .from("complaints")
    .select(
      "id, created_at, category, subject, message, is_anonymous, contact_id, contacts(first_name, last_name), complaint_number, status, reviewer_comment, photo_path",
    )
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

  const statusCounts = STATUS_ORDER.map((value) => ({
    category: value,
    label: STATUS_LABELS[value] ?? value,
    count: allComplaints.filter((c) => c.status === value).length,
  }));

  const params = await searchParams;
  const filtered = allComplaints.filter((c) => {
    if (params.category && c.category !== params.category) return false;
    if (params.status && c.status !== params.status) return false;
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
      subject: c.subject,
      message: c.message,
      submitterName: c.is_anonymous
        ? null
        : contact
          ? `${contact.first_name} ${contact.last_name}`
          : "Nombre no disponible",
      complaintNumber: c.complaint_number,
      status: c.status,
      statusLabel: STATUS_LABELS[c.status] ?? c.status,
      reviewerComment: c.reviewer_comment,
      hasPhoto: Boolean(c.photo_path),
    };
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Reportes Recibidos</h1>
        <p className="text-sm text-muted-foreground">Solo tú puedes ver esta información.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ComplaintsSummaryCards summary={summary} />
        <ComplaintsCategoryChart counts={categoryCounts} title="Reportes por categoría" />
        <ComplaintsCategoryChart counts={statusCounts} title="Reportes por estado" />
      </div>
      <ComplaintsFilterBar
        category={params.category ?? null}
        status={params.status ?? null}
        search={params.search ?? ""}
      />
      <ComplaintsList rows={rows} />
    </div>
  );
}
