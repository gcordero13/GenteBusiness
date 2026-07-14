import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getUpcomingBirthdays, whatsappUrl } from "@/lib/contacts";
import { SearchFilters } from "./SearchFilters";
import { BirthdaysWidget } from "./BirthdaysWidget";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    company?: string;
    department?: string;
    showInactive?: string;
  }>;
}) {
  const { q, company, department, showInactive } = await searchParams;

  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_role_flags");
  const flags = flagsRows?.[0];
  if (!flags?.can_view) {
    redirect("/");
  }

  let query = supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, email, position, company_id, department_id, status, fleet_phone, has_whatsapp, birth_date, companies(name), departments(name)",
    )
    .order("first_name");

  if (!showInactive || !(flags.can_deactivate || flags.can_delete)) {
    query = query.eq("status", "active");
  }
  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Agenda de contactos</h1>
        {flags.can_add && (
          <a href="/contacts/new" className="text-sm underline">
            Nuevo contacto
          </a>
        )}
      </div>
      <BirthdaysWidget contacts={birthdayContacts} />
      <SearchFilters
        companies={companies ?? []}
        departments={departments ?? []}
        canSeeInactiveToggle={Boolean(flags.can_deactivate || flags.can_delete)}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Flota</TableHead>
            <TableHead>Puesto</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Departamento</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(contacts ?? []).map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <a href={`/contacts/${c.id}`} className="underline">
                  {c.first_name} {c.last_name}
                </a>
              </TableCell>
              <TableCell>
                {c.email && (
                  <a href={`mailto:${c.email}`} className="underline">
                    {c.email}
                  </a>
                )}
              </TableCell>
              <TableCell>
                {c.fleet_phone &&
                  (c.has_whatsapp ? (
                    <a
                      href={whatsappUrl(c.fleet_phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {c.fleet_phone}
                    </a>
                  ) : (
                    c.fleet_phone
                  ))}
              </TableCell>
              <TableCell>{c.position}</TableCell>
              <TableCell>{(c.companies as unknown as { name: string })?.name}</TableCell>
              <TableCell>{(c.departments as unknown as { name: string })?.name}</TableCell>
              <TableCell>{c.status === "active" ? "Activo" : "Anulado"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
