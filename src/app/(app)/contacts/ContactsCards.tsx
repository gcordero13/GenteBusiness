import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";
import { ContactViewDialog } from "./ContactViewDialog";
import type { ContactRow } from "./ContactsTable";

export function ContactsCards({
  contacts,
  canEdit = false,
}: {
  contacts: ContactRow[];
  canEdit?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {contacts.map((c) => (
        <div
          key={c.id}
          className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-shadow hover:shadow-md"
        >
          <Avatar className="size-16">
            <AvatarImage src={c.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-lg">
              {`${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ContactViewDialog contact={c} canEdit={canEdit}>
            <span className="font-medium underline">
              {c.first_name} {c.last_name}
            </span>
          </ContactViewDialog>
          {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
          <p className="text-xs text-muted-foreground">
            {c.companies?.name}
            {c.companies?.name && c.departments?.name ? " · " : ""}
            {c.departments?.name}
          </p>
          {c.extension && (
            <span
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              title={`Extensión ${c.extension}`}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
                <Phone className="size-3" />
              </span>
              Ext. {c.extension}
            </span>
          )}
          <Badge variant={c.status === "active" ? "default" : "secondary"}>
            {c.status === "active" ? "Activo" : "Anulado"}
          </Badge>
          <div className="flex gap-3 pt-1">
            {c.email && (
              <a href={`mailto:${c.email}`} title={c.email}>
                <Mail className="size-4 text-muted-foreground hover:text-foreground" />
              </a>
            )}
            {c.fleet_phone && c.has_whatsapp && (
              <a href={whatsappUrl(c.fleet_phone)} target="_blank" rel="noopener noreferrer" title={c.fleet_phone}>
                <MessageCircle className="size-4 text-muted-foreground hover:text-foreground" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
