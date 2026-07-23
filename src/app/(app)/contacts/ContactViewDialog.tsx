"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";
import type { ContactRow } from "./ContactsTable";

export function ContactViewDialog({
  contact,
  canEdit,
  children,
}: {
  contact: ContactRow;
  canEdit: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<button type="button" className="text-left">{children}</button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {contact.first_name} {contact.last_name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-lg">
              {`${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            {contact.position && <p className="text-sm text-muted-foreground">{contact.position}</p>}
            <p className="text-sm text-muted-foreground">
              {contact.companies?.name}
              {contact.companies?.name && contact.departments?.name ? " · " : ""}
              {contact.departments?.name}
            </p>
            <Badge variant={contact.status === "active" ? "default" : "secondary"}>
              {contact.status === "active" ? "Activo" : "Anulado"}
            </Badge>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          {contact.extension && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" />
              Ext. {contact.extension}
            </p>
          )}
          {contact.fleet_phone && (
            <p className="flex items-center gap-2">
              <MessageCircle className="size-4 text-muted-foreground" />
              {contact.fleet_phone}
              {contact.has_whatsapp && (
                <a
                  href={whatsappUrl(contact.fleet_phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  WhatsApp
                </a>
              )}
            </p>
          )}
          {contact.email && (
            <p className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              <a href={`mailto:${contact.email}`} className="underline underline-offset-2">
                {contact.email}
              </a>
            </p>
          )}
          {!contact.extension && !contact.fleet_phone && !contact.email && (
            <p className="text-muted-foreground">Sin datos de contacto adicionales.</p>
          )}
        </div>
        {canEdit && (
          <DialogFooter>
            <Button render={<a href={`/contacts/${contact.id}`}>Editar</a>} />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
