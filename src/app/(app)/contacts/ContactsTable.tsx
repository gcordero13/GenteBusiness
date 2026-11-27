"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { whatsappUrl } from "@/lib/contacts";
import { ContactViewDialog } from "./ContactViewDialog";
import { ContactPhotoUploadDialog, type ContactPhotoTarget } from "./ContactPhotoUploadDialog";

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
  hire_date: string | null;
  schedule_line: string;
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
  const [photoContact, setPhotoContact] = useState<ContactPhotoTarget | null>(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);

  function avatar(c: ContactRow, size: string) {
    const img = (
      <Avatar className={`${size} shrink-0`}>
        <AvatarImage src={c.photo_url ?? undefined} alt="" />
        <AvatarFallback>{`${c.first_name[0] ?? ""}${c.last_name[0] ?? ""}`.toUpperCase()}</AvatarFallback>
      </Avatar>
    );
    if (!canEdit) return img;
    return (
      <button
        type="button"
        onClick={() => {
          setPhotoContact(c);
          setPhotoDialogOpen(true);
        }}
        className="shrink-0 rounded-full transition-opacity hover:opacity-75"
        title="Cambiar foto"
        aria-label={`Cambiar foto de ${c.first_name} ${c.last_name}`}
      >
        {img}
      </button>
    );
  }

  return (
    <>
      {/* Phone: one card per contact, every field readable and the
          call / WhatsApp / email actions as real buttons (user request,
          2026-11-27: the table wasted the space on a phone). */}
      <ul className="space-y-2 md:hidden">
        {contacts.map((c) => {
          const area = [c.companies?.name, c.departments?.name].filter(Boolean).join(" · ");
          return (
            <li key={c.id} className="rounded-xl border bg-card p-3.5 shadow-xs">
              <div className="flex items-start gap-3">
                {avatar(c, "size-12")}
                <div className="min-w-0 flex-1">
                  <ContactViewDialog contact={c} canEdit={canEdit}>
                    <span className="block text-[15px] leading-snug font-semibold hover:underline">
                      {c.first_name} {c.last_name}
                    </span>
                  </ContactViewDialog>
                  {c.position && <p className="text-sm text-muted-foreground">{c.position}</p>}
                  {area && <p className="truncate text-xs text-muted-foreground">{area}</p>}
                </div>
              </div>
              {(c.extension || c.fleet_phone || c.email) && (
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  {c.extension && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Extensión</dt>
                      <dd className="font-medium tabular-nums">{c.extension}</dd>
                    </div>
                  )}
                  {c.fleet_phone && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Teléfono</dt>
                      <dd className="font-medium tabular-nums">{c.fleet_phone}</dd>
                    </div>
                  )}
                  {c.email && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-xs text-muted-foreground">Correo</dt>
                      <dd className="truncate font-medium">{c.email}</dd>
                    </div>
                  )}
                </dl>
              )}
              {(c.fleet_phone || c.email) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.fleet_phone && (
                    <a
                      href={`tel:${c.fleet_phone.replace(/[^\d+]/g, "")}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
                    >
                      <Phone className="size-4" />
                      Llamar
                    </a>
                  )}
                  {c.fleet_phone && c.has_whatsapp && (
                    <a
                      href={whatsappUrl(c.fleet_phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
                    >
                      <MessageCircle className="size-4" />
                      WhatsApp
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
                    >
                      <Mail className="size-4" />
                      Correo
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

    <div className="hidden overflow-hidden rounded-xl border md:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="py-3">Nombre</TableHead>
            <TableHead className="hidden py-3 md:table-cell">Puesto</TableHead>
            <TableHead className="hidden py-3 md:table-cell">Empresa</TableHead>
            <TableHead className="hidden py-3 lg:table-cell">Departamento</TableHead>
            <TableHead className="py-3">Extensión</TableHead>
            <TableHead className="py-3 text-right">Contacto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="py-3">
                <div className="flex items-center gap-3">
                  {avatar(c, "size-8")}
                  <ContactViewDialog contact={c} canEdit={canEdit}>
                    <span className="font-medium hover:underline">
                      {c.first_name} {c.last_name}
                    </span>
                  </ContactViewDialog>
                </div>
              </TableCell>
              <TableCell className="hidden py-3 text-muted-foreground md:table-cell">
                {c.position}
              </TableCell>
              <TableCell className="hidden py-3 text-muted-foreground md:table-cell">
                {c.companies?.name}
              </TableCell>
              <TableCell className="hidden py-3 text-muted-foreground lg:table-cell">
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
      <ContactPhotoUploadDialog
        key={photoContact?.id ?? "none"}
        contact={photoContact}
        open={photoDialogOpen}
        onOpenChange={setPhotoDialogOpen}
      />
    </>
  );
}
