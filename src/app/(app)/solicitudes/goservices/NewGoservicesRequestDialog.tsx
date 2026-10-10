"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createGoservicesRequest } from "./actions";

type RequestType = "mantenimiento" | "mensajeria";
type Categoria = "cerrajeria" | "mobiliario" | "instalaciones_electricas" | "plomeria" | "infraestructura";

const REQUEST_TYPES: { value: RequestType; label: string }[] = [
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "mensajeria", label: "Mensajería" },
];

const UBICACIONES = [
  { value: "oficina", label: "Oficina" },
  { value: "alojamiento", label: "Alojamiento" },
];

const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: "cerrajeria", label: "Cerrajería" },
  { value: "mobiliario", label: "Mobiliario" },
  { value: "instalaciones_electricas", label: "Instalaciones eléctricas" },
  { value: "plomeria", label: "Plomería" },
  { value: "infraestructura", label: "Infraestructura" },
];

const SUBCATEGORIAS: Partial<Record<Categoria, string[]>> = {
  mobiliario: ["Compra", "Cambio", "Reparación", "Instalación"],
  plomeria: ["Reparación", "Cambio", "Fugas"],
  infraestructura: ["Pintura", "Filtraciones", "Pisos", "Reparación de paredes"],
  instalaciones_electricas: ["Cambio de iluminaria", "Revisión de tomacorriente", "Revisión de electrodoméstico"],
};

const TIPOS_MENSAJERIA = [
  { value: "envio", label: "Envío" },
  { value: "retiro", label: "Retiro" },
  { value: "compras", label: "Compras" },
  { value: "traslados", label: "Traslados" },
];

export function NewGoservicesRequestDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>("mantenimiento");
  const [ubicacion, setUbicacion] = useState("");
  const [categoria, setCategoria] = useState("");
  const [subcategoria, setSubcategoria] = useState("");
  const [tipoMensajeria, setTipoMensajeria] = useState("");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [contactoDireccion, setContactoDireccion] = useState("");
  const [detalle, setDetalle] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [documento, setDocumento] = useState<File | null>(null);
  const [fotoInputKey, setFotoInputKey] = useState(0);
  const [documentoInputKey, setDocumentoInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const subcategoriaOptions = SUBCATEGORIAS[categoria as Categoria];

  function resetForm() {
    setRequestType("mantenimiento");
    setUbicacion("");
    setCategoria("");
    setSubcategoria("");
    setTipoMensajeria("");
    setContactoNombre("");
    setContactoTelefono("");
    setContactoDireccion("");
    setDetalle("");
    setFoto(null);
    setDocumento(null);
    setFotoInputKey((k) => k + 1);
    setDocumentoInputKey((k) => k + 1);
  }

  function submit() {
    if (!detalle.trim()) {
      setError("Escribe el detalle de la solicitud antes de enviar.");
      return;
    }
    if (requestType === "mantenimiento") {
      if (!ubicacion || !categoria) {
        setError("Selecciona la ubicación y el tipo de solicitud.");
        return;
      }
    } else {
      if (!tipoMensajeria) {
        setError("Selecciona el tipo de solicitud.");
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      const result = await createGoservicesRequest({
        requestType,
        ubicacion: requestType === "mantenimiento" ? (ubicacion as "oficina" | "alojamiento") : undefined,
        categoria: requestType === "mantenimiento" ? (categoria as Categoria) : undefined,
        subcategoria: requestType === "mantenimiento" ? (subcategoria || undefined) : undefined,
        tipoMensajeria:
          requestType === "mensajeria"
            ? (tipoMensajeria as "envio" | "retiro" | "compras" | "traslados")
            : undefined,
        contactoNombre: requestType === "mensajeria" ? contactoNombre : undefined,
        contactoTelefono: requestType === "mensajeria" ? contactoTelefono : undefined,
        contactoDireccion: requestType === "mensajeria" ? contactoDireccion : undefined,
        detalle,
        foto,
        documento,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button>Nueva solicitud</Button>} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva solicitud GoServices</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Tipo de solicitud</Label>
            <div className="inline-flex rounded-lg border p-1">
              {REQUEST_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setRequestType(t.value);
                    setUbicacion("");
                    setCategoria("");
                    setSubcategoria("");
                    setTipoMensajeria("");
                  }}
                  className={`rounded-md px-4 py-2 text-sm ${
                    requestType === t.value ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {requestType === "mantenimiento" ? (
            <>
              <div className="space-y-1">
                <Label>Ubicación</Label>
                <Select value={ubicacion} onValueChange={(v) => setUbicacion(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona una ubicación">
                      {(value: string) => UBICACIONES.find((u) => u.value === value)?.label ?? "Selecciona una ubicación"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {UBICACIONES.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de solicitud</Label>
                <Select
                  value={categoria}
                  onValueChange={(v) => {
                    setCategoria(v ?? "");
                    setSubcategoria("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un tipo">
                      {(value: string) => CATEGORIAS.find((c) => c.value === value)?.label ?? "Selecciona un tipo"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {subcategoriaOptions && (
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  <Select value={subcategoria} onValueChange={(v) => setSubcategoria(v ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona una categoría">
                        {(value: string) => value || "Selecciona una categoría"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {subcategoriaOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Tipo de solicitud</Label>
                <Select value={tipoMensajeria} onValueChange={(v) => setTipoMensajeria(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un tipo">
                      {(value: string) => TIPOS_MENSAJERIA.find((t) => t.value === value)?.label ?? "Selecciona un tipo"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_MENSAJERIA.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nombre del contacto</Label>
                <Input value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={contactoTelefono} onChange={(e) => setContactoTelefono(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <Input value={contactoDireccion} onChange={(e) => setContactoDireccion(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label>Detalle de la solicitud</Label>
            <textarea
              className="w-full rounded-md border p-2 text-sm"
              rows={4}
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              placeholder="Describe la solicitud..."
            />
          </div>

          <div className="space-y-1">
            <Label>Foto (opcional)</Label>
            <input
              key={fotoInputKey}
              type="file"
              accept="image/*"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            {foto && <p className="text-xs text-muted-foreground">Seleccionado: {foto.name}</p>}
          </div>

          <div className="space-y-1">
            <Label>Documento (opcional)</Label>
            <input
              key={documentoInputKey}
              type="file"
              onChange={(e) => setDocumento(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
            {documento && <p className="text-xs text-muted-foreground">Seleccionado: {documento.name}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending}>
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
