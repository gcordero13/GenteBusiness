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
import { Cake, Clock, Mail, Phone } from "lucide-react";
import {
  formatMonthDay,
  formatTenure,
  getBusinessToday,
  getInitials,
  whatsappUrl,
  type BirthdayContact,
} from "@/lib/contacts";

export function BirthdayContactModal({
  contact,
  trigger,
}: {
  contact: BirthdayContact;
  trigger: ReactElement;
}) {
  const tenure = contact.hire_date ? formatTenure(contact.hire_date, getBusinessToday()) : null;

  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="sr-only">{contact.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 p-2 text-center">
          <Avatar className="size-28 sm:size-40">
            <AvatarImage src={contact.photo_url ?? undefined} alt="" />
            <AvatarFallback className="text-3xl sm:text-5xl">{getInitials(contact.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <p className="text-xl font-semibold text-foreground break-words sm:text-3xl">{contact.name}</p>
            {contact.position && (
              <p className="text-base text-muted-foreground break-words sm:text-lg">{contact.position}</p>
            )}
            <p className="text-base text-muted-foreground break-words sm:text-lg">
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
              <p className="text-base font-semibold sm:text-lg">
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
                  className="text-base font-semibold break-all underline underline-offset-2 sm:text-lg"
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
                <p className="text-base font-semibold break-words sm:text-lg">{contact.extension}</p>
              </div>
            </div>
          )}
          {contact.fleet_phone && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Phone className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Teléfono / Flota</p>
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
      </DialogContent>
    </Dialog>
  );
}
