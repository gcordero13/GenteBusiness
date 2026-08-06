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
import { Clock, Mail, MessageCircle, Phone } from "lucide-react";
import { formatTenure, getBusinessToday, whatsappUrl } from "@/lib/contacts";
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
  const hasContactInfo = Boolean(
    contact.extension || contact.fleet_phone || contact.email || contact.hire_date,
  );
  const tenure = contact.hire_date ? formatTenure(contact.hire_date, getBusinessToday()) : null;

  return (
    <Dialog>
      <DialogTrigger render={<button type="button" className="text-left">{children}</button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="sr-only">
            {contact.first_name} {contact.last_name}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 p-2 text-center">
          <Avatar className="size-28 sm:size-40">
            <AvatarImage src={contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-3xl sm:text-5xl">
              {`${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5">
            <p className="text-xl font-semibold break-words sm:text-3xl">
              {contact.first_name} {contact.last_name}
            </p>
            {contact.position && (
              <p className="text-base text-muted-foreground break-words sm:text-lg">{contact.position}</p>
            )}
            <p className="text-base text-muted-foreground break-words sm:text-lg">
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
                <Phone className="size-6 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Extensión</p>
                  <p className="text-base font-semibold break-words sm:text-lg">{contact.extension}</p>
                </div>
              </div>
            )}
            {contact.fleet_phone && (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <MessageCircle className="size-6 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Teléfono</p>
                  {contact.has_whatsapp ? (
                    <a
                      href={whatsappUrl(contact.fleet_phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-semibold break-words underline underline-offset-2 sm:text-lg"
                    >
                      {contact.fleet_phone}
                    </a>
                  ) : (
                    <p className="text-base font-semibold break-words sm:text-lg">{contact.fleet_phone}</p>
                  )}
                </div>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
                <Mail className="size-6 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Correo</p>
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-base font-semibold break-all underline underline-offset-2 sm:text-lg"
                  >
                    {contact.email}
                  </a>
                </div>
              </div>
            )}
            {tenure && (
              <div className="flex items-center gap-3 rounded-lg border p-3 sm:col-span-2">
                <Clock className="size-6 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Tiempo en la empresa</p>
                  <p className="text-base font-semibold sm:text-lg">{tenure}</p>
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
