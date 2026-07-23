import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mail, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";
import { ContactViewDialog } from "./ContactViewDialog";

export interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  position: string | null;
  status: string;
  extension: string | null;
  fleet_phone: string | null;
  has_whatsapp: boolean;
  photo_url: string | null;
  reports_to_id: string | null;
  companies: { name: string } | null;
  departments: { name: string } | null;
}

export function ContactsTable({
  contacts,
  canEdit = false,
}: {
  contacts: ContactRow[];
  canEdit?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="py-3">Nombre</TableHead>
            <TableHead className="py-3">Puesto</TableHead>
            <TableHead className="py-3">Empresa</TableHead>
            <TableHead className="py-3">Departamento</TableHead>
            <TableHead className="py-3">Extensión</TableHead>
            <TableHead className="py-3 text-right">Contacto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="py-3">
                <ContactViewDialog contact={c} canEdit={canEdit}>
                  <span className="flex items-center gap-3 hover:underline">
                    <Avatar className="size-8">
                      <AvatarImage src={c.photo_url ?? undefined} alt="" />
                      <AvatarFallback>
                        {`${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">
                      {c.first_name} {c.last_name}
                    </span>
                  </span>
                </ContactViewDialog>
              </TableCell>
              <TableCell className="py-3 text-muted-foreground">{c.position}</TableCell>
              <TableCell className="py-3 text-muted-foreground">{c.companies?.name}</TableCell>
              <TableCell className="py-3 text-muted-foreground">
                {c.departments?.name}
              </TableCell>
              <TableCell className="py-3 text-muted-foreground">{c.extension}</TableCell>
              <TableCell className="py-3">
                <div className="flex justify-end gap-3">
                  {c.email && (
                    <a href={`mailto:${c.email}`} title={c.email}>
                      <Mail className="size-4 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                  {c.fleet_phone && c.has_whatsapp && (
                    <a
                      href={whatsappUrl(c.fleet_phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={c.fleet_phone}
                    >
                      <MessageCircle className="size-4 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
