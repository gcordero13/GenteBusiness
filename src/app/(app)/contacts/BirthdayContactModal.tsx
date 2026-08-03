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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="sr-only">{contact.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 p-2 text-center">
          <Avatar className="size-40">
            <AvatarImage src={contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-5xl">{getInitials(contact.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="text-3xl font-semibold text-foreground break-words">{contact.name}</p>
            {contact.position && (
              <p className="text-lg text-muted-foreground break-words">{contact.position}</p>
            )}
            <p className="text-lg text-muted-foreground break-words">
              {contact.company_name}
              {contact.company_name && contact.department_name ? " · " : ""}
              {contact.department_name}
            </p>
          </div>
        </div>
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Cake className="size-6 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Cumpleaños</p>
              <p className="text-lg font-semibold">
                {contact.birth_date ? formatMonthDay(contact.birth_date) : "-"}
              </p>
            </div>
          </div>
          {contact.email && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Mail className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Correo</p>
                <a
                  href={`mailto:${contact.email}`}
                  className="text-lg font-semibold underline underline-offset-2 break-all"
                >
                  {contact.email}
                </a>
              </div>
            </div>
          )}
          {contact.extension && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Phone className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Extensión</p>
                <p className="text-lg font-semibold break-words">{contact.extension}</p>
              </div>
            </div>
          )}
          {contact.fleet_phone && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Phone className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Teléfono / Flota</p>
                <p className="text-lg font-semibold break-words">
                  {contact.fleet_phone}
                  {contact.has_whatsapp && (
                    <a
                      href={whatsappUrl(contact.fleet_phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-base font-normal underline underline-offset-2"
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
