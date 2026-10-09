"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GoservicesRequestRow } from "./actions";

const UBICACION_LABELS: Record<string, string> = {
  oficina: "Oficina",
  alojamiento: "Alojamiento",
};

export function GoservicesRequestDetailDialog({ request }: { request: GoservicesRequestRow }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Ver</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{request.typeLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{request.createdAtLabel}</span>
            <Badge variant={request.status === "completado" ? "default" : request.status === "cancelado" ? "secondary" : "outline"}>
              {request.statusLabel}
            </Badge>
          </div>

          {request.requestType === "mantenimiento" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Ubicación</p>
                <p>{request.ubicacion ? (UBICACION_LABELS[request.ubicacion] ?? request.ubicacion) : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Categoría / Subcategoría</p>
                <p>
                  {request.typeLabel}
                  {request.subcategoria ? ` / ${request.subcategoria}` : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Tipo de solicitud</p>
                <p>{request.typeLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Nombre de contacto</p>
                <p>{request.contactoNombre ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Teléfono</p>
                <p>{request.contactoTelefono ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Dirección</p>
                <p>{request.contactoDireccion ?? "—"}</p>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground">Detalle</p>
            <p className="whitespace-pre-wrap">{request.detalle}</p>
          </div>

          {(request.fotoUrl || request.documentoUrl) && (
            <div className="flex flex-wrap gap-4">
              {request.fotoUrl && (
                <a
                  href={request.fotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Ver foto
                </a>
              )}
              {request.documentoUrl && (
                <a
                  href={request.documentoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  Ver documento
                </a>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
