import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookUser } from "lucide-react";
import { escapeIlikePattern, getUpcomingBirthdays } from "@/lib/contacts";
import { SearchFilters } from "./SearchFilters";
import { BirthdaysWidget } from "./BirthdaysWidget";
import { ContactsTable, type ContactRow } from "./ContactsTable";
import { ContactsCards } from "./ContactsCards";
import { ContactsGrouped } from "./ContactsGrouped";
import { ContactsOrgChart } from "./ContactsOrgChart";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    company?: string;
    department?: string;
    showInactive?: string;
    view?: string;
  }>;
}) {
  const { q, company, department, showInactive, view } = await searchParams;

  const activeView =
    view === "cards" ? "cards" : view === "grouped" ? "grouped" : view === "org" ? "org" : "table";
  function viewHref(target: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (company) params.set("company", company);
    if (department) params.set("department", department);
    if (showInactive) params.set("showInactive", showInactive);
    params.set("view", target);
    return `/contacts?${params.toString()}`;
  }

  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    redirect("/");
  }

  let query = supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, email, position, company_id, department_id, status, fleet_phone, has_whatsapp, birth_date, photo_url, reports_to_id, companies(name), departments(name)",
    )
    .order("first_name");

  if (!showInactive || !(flags.can_deactivate || flags.can_delete)) {
    query = query.eq("status", "active");
  }
  if (q) {
    const pattern = escapeIlikePattern(q);
    query = query.or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`);
  }
  if (company) {
    query = query.eq("company_id", company);
  }
  if (department) {
    query = query.eq("department_id", department);
  }

  const { data: contacts } = await query;
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");

  const birthdayContacts = getUpcomingBirthdays(
    (contacts ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      birth_date: c.birth_date,
    })),
    new Date(),
    5,
  );

  const contactRows: ContactRow[] = (contacts ?? []).map((c) => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    email: c.email,
    position: c.position,
    status: c.status,
    fleet_phone: c.fleet_phone,
    has_whatsapp: c.has_whatsapp,
    photo_url: c.photo_url,
    reports_to_id: c.reports_to_id,
    companies: (c.companies as unknown as { name: string } | null) ?? null,
    departments: (c.departments as unknown as { name: string } | null) ?? null,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Agenda de contactos</h1>
        {flags.can_add && (
          <a href="/contacts/new" className="text-sm underline">
            Nuevo contacto
          </a>
        )}
      </div>
      <BirthdaysWidget contacts={birthdayContacts} />
      <div className="flex gap-1 text-sm">
        <a
          href={viewHref("table")}
          className={`rounded-lg px-3 py-1 ${activeView === "table" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
        >
          Tabla
        </a>
        <a
          href={viewHref("cards")}
          className={`rounded-lg px-3 py-1 ${activeView === "cards" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
        >
          Tarjetas
        </a>
        <a
          href={viewHref("grouped")}
          className={`rounded-lg px-3 py-1 ${activeView === "grouped" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
        >
          Agrupado
        </a>
        <a
          href={viewHref("org")}
          className={`rounded-lg px-3 py-1 ${activeView === "org" ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`}
        >
          Organigrama
        </a>
      </div>
      <SearchFilters
        companies={companies ?? []}
        departments={departments ?? []}
        canSeeInactiveToggle={Boolean(flags.can_deactivate || flags.can_delete)}
      />
      {contactRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <BookUser className="size-8" />
          <p className="text-sm">No hay contactos todavía.</p>
          {flags.can_add && (
            <p className="text-xs">Crea el primero con el botón &quot;Nuevo contacto&quot;.</p>
          )}
        </div>
      ) : activeView === "cards" ? (
        <ContactsCards contacts={contactRows} />
      ) : activeView === "grouped" ? (
        <ContactsGrouped contacts={contactRows} />
      ) : activeView === "org" ? (
        <ContactsOrgChart contacts={contactRows} />
      ) : (
        <ContactsTable contacts={contactRows} />
      )}
    </div>
  );
}
