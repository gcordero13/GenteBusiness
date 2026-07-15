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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BookUser, Mail, MessageCircle, Pencil } from "lucide-react";
import { escapeIlikePattern, getUpcomingBirthdays, whatsappUrl } from "@/lib/contacts";
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
      "id, first_name, last_name, email, position, company_id, department_id, status, fleet_phone, has_whatsapp, birth_date, photo_url, companies(name), departments(name)",
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
      <SearchFilters
        companies={companies ?? []}
        departments={departments ?? []}
        canSeeInactiveToggle={Boolean(flags.can_deactivate || flags.can_delete)}
      />
      {(contacts ?? []).length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <BookUser className="size-8" />
          <p className="text-sm">No hay contactos todavía.</p>
          {flags.can_add && (
            <p className="text-xs">Crea el primero con el botón &quot;Nuevo contacto&quot;.</p>
          )}
        </div>
      ) : (
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
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(contacts ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={c.photo_url ?? undefined} alt="" />
                      <AvatarFallback>
                        {`${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <a href={`/contacts/${c.id}`} className="underline">
                      {c.first_name} {c.last_name}
                    </a>
                  </div>
                </TableCell>
                <TableCell>
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 underline"
                    >
                      <Mail className="size-3.5" />
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
                        className="inline-flex items-center gap-1 underline"
                      >
                        <MessageCircle className="size-3.5" />
                        {c.fleet_phone}
                      </a>
                    ) : (
                      c.fleet_phone
                    ))}
                </TableCell>
                <TableCell>{c.position}</TableCell>
                <TableCell>{(c.companies as unknown as { name: string })?.name}</TableCell>
                <TableCell>{(c.departments as unknown as { name: string })?.name}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>
                    {c.status === "active" ? "Activo" : "Anulado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <a href={`/contacts/${c.id}`} title="Editar">
                    <Pencil className="size-4 text-muted-foreground hover:text-foreground" />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
