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
import { Mail, MessageCircle, Pencil } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";

export interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  position: string | null;
  status: string;
  fleet_phone: string | null;
  has_whatsapp: boolean;
  photo_url: string | null;
  reports_to_id: string | null;
  companies: { name: string } | null;
  departments: { name: string } | null;
}

export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  return (
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
        {contacts.map((c) => (
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
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 underline">
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
            <TableCell>{c.companies?.name}</TableCell>
            <TableCell>{c.departments?.name}</TableCell>
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
  );
}
