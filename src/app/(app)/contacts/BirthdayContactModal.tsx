"use client";

import type { ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Cake, Mail, Phone } from "lucide-react";
import { formatMonthDay, getInitials, whatsappUrl, type BirthdayContact } from "@/lib/contacts";

export function BirthdayContactModal({
  contact,
  trigger,
}: {
  contact: BirthdayContact;
  trigger: ReactElement;
}) {
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">{contact.name}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-5 p-2">
          <Avatar className="size-24">
            <AvatarImage src={contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-2xl">{getInitials(contact.name)}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-foreground">{contact.name}</p>
            {contact.position && <p className="text-muted-foreground">{contact.position}</p>}
            <p className="text-muted-foreground">
              {contact.company_name}
              {contact.company_name && contact.department_name ? " · " : ""}
              {contact.department_name}
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Cake className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Cumpleaños</p>
              <p className="font-medium">
                {contact.birth_date ? formatMonthDay(contact.birth_date) : "-"}
              </p>
            </div>
          </div>
          {contact.email && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Mail className="size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Correo</p>
                <a href={`mailto:${contact.email}`} className="font-medium underline underline-offset-2">
                  {contact.email}
                </a>
              </div>
            </div>
          )}
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
              <Phone className="size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Teléfono / Flota</p>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
