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
  const hasContactInfo = Boolean(contact.extension || contact.fleet_phone || contact.email);

  return (
    <Dialog>
      <DialogTrigger render={<button type="button" className="text-left">{children}</button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="sr-only">
            {contact.first_name} {contact.last_name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-5 p-2">
          <Avatar className="size-24">
            <AvatarImage src={contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-2xl">
              {`${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1.5">
            <p className="text-2xl font-semibold">
              {contact.first_name} {contact.last_name}
            </p>
            {contact.position && <p className="text-muted-foreground">{contact.position}</p>}
            <p className="text-muted-foreground">
              {contact.companies?.name}
              {contact.companies?.name && contact.departments?.name ? " · " : ""}
              {contact.departments?.name}
            </p>
            <Badge variant={contact.status === "active" ? "default" : "secondary"}>
              {contact.status === "active" ? "Activo" : "Anulado"}
            </Badge>
          </div>
        </div>
        {hasContactInfo ? (
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
            {contact.extension && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Phone className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Extensión</p>
                  <p className="font-medium">{contact.extension}</p>
                </div>
              </div>
            )}
            {contact.fleet_phone && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <MessageCircle className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Teléfono</p>
                  <p className="font-medium">
                    {contact.fleet_phone}
                    {contact.has_whatsapp && (
                      <a
                        href={whatsappUrl(contact.fleet_phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-sm underline underline-offset-2"
                      >
                        WhatsApp
                      </a>
                    )}
                  </p>
                </div>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
                <Mail className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Correo</p>
                  <a href={`mailto:${contact.email}`} className="font-medium underline underline-offset-2">
                    {contact.email}
                  </a>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="border-t pt-4 text-sm text-muted-foreground">
            Sin datos de contacto adicionales.
          </p>
        )}
        {canEdit && (
          <DialogFooter>
            <Button render={<a href={`/contacts/${contact.id}`}>Editar</a>} />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
