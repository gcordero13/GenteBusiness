"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, KeyRound, MoreHorizontal, Pencil, RotateCcw, Search, Trash2, Users as UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditUserDialog } from "./EditUserDialog";
import { SetPasswordDialog } from "./SetPasswordDialog";
import { RoleProfileSelect } from "./RoleProfileSelect";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { setUserStatus, deleteUsers } from "./actions";

export interface UsersTableRow {
  id: string;
  email: string;
  full_name: string | null;
  role_profile_id: string;
  status: string;
  /** Name shown: the Agenda contact's (matched by email), else full_name. */
  display_name?: string | null;
  photo_url?: string | null;
}

/** Name or email contains every word typed (accents and case don't matter). */
export function coincideUsuario(u: UsersTableRow, query: string): boolean {
  const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const texto = normalizar(`${u.display_name ?? ""} ${u.full_name ?? ""} ${u.email}`);
  return normalizar(query).trim().split(/\s+/).every((palabra) => texto.includes(palabra));
}

function initialsFor(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const [first, second] = trimmed.split(/\s+/);
    return `${first?.[0] ?? ""}${second?.[0] ?? ""}`.toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
}

type EstadoFiltro = "todos" | "activos" | "anulados";
type Accion = { tipo: "nombre" | "clave" | "eliminar"; user: UsersTableRow } | null;

const esActivo = (u: UsersTableRow) => u.status === "active";

function EstadoPill({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        activo
          ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      <span className={`size-1.5 rounded-full ${activo ? "bg-emerald-500" : "bg-slate-400"}`} />
      {activo ? "Activo" : "Anulado"}
    </span>
  );
}

/**
 * Usuarios (redesigned 2026-11-27, same visual system as Proyectos): numbers
 * at the top, search plus estado/perfil filters, one actions menu per user
 * instead of four buttons, and cards on a phone.
 */
export function UsersTable({
  users,
  profiles,
}: {
  users: UsersTableRow[];
  profiles: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [, startStatusTransition] = useTransition();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkDeleting, startBulkDelete] = useTransition();
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("todos");
  const [perfil, setPerfil] = useState("");
  const [accion, setAccion] = useState<Accion>(null);

  const activos = users.filter(esActivo).length;
  const anulados = users.length - activos;
  const sinNombre = users.filter((u) => !u.display_name).length;

  const visibles = useMemo(
    () =>
      users.filter(
        (u) =>
          (!query.trim() || coincideUsuario(u, query)) &&
          (estado === "todos" || (estado === "activos") === esActivo(u)) &&
          (!perfil || u.role_profile_id === perfil),
      ),
    [users, query, estado, perfil],
  );
  const filtrando = Boolean(query.trim() || estado !== "todos" || perfil);
  const allSelected = visibles.length > 0 && visibles.every((u) => selectedIds.has(u.id));
  const selectedEmails = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)).map((u) => u.email),
    [users, selectedIds],
  );

  // "Select all" applies to the users shown by the search and filters.
  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const u of visibles) {
        if (allSelected) next.delete(u.id);
        else next.add(u.id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleStatus(u: UsersTableRow) {
    setStatusPendingId(u.id);
    startStatusTransition(async () => {
      await setUserStatus({ userId: u.id, status: esActivo(u) ? "deactivated" : "active" });
      setStatusPendingId(null);
      router.refresh();
    });
  }

  function confirmBulkDelete() {
    setBulkError(null);
    startBulkDelete(async () => {
      const result = await deleteUsers([...selectedIds]);
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      if (result.failed.length > 0) {
        const emailById = new Map(users.map((u) => [u.id, u.email]));
        setBulkError(
          `${result.deletedCount} eliminado(s). ${result.failed.length} no se pudieron eliminar: ${result.failed
            .map((f) => `${emailById.get(f.userId) ?? f.userId} (${f.message})`)
            .join("; ")}`,
        );
        // Keep only the ones that failed selected, so retrying is one click
        // and the dialog's title/email list stay consistent with the error
        // message instead of dropping to "0 usuario(s)" with nothing listed.
        setSelectedIds(new Set(result.failed.map((f) => f.userId)));
      } else {
        setBulkDeleteOpen(false);
        setSelectedIds(new Set());
      }
      router.refresh();
    });
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
        <UsersIcon className="size-8" />
        <p className="text-sm font-medium text-foreground">No hay usuarios todavía</p>
        <p className="text-sm">Invita al primero con «Invitar usuario».</p>
      </div>
    );
  }

  function persona(u: UsersTableRow, size: string) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className={`${size} shrink-0`}>
          {u.photo_url && <AvatarImage src={u.photo_url} alt="" />}
          <AvatarFallback className="font-semibold">{initialsFor(u.display_name ?? u.full_name, u.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {u.display_name ?? <span className="font-normal text-muted-foreground italic">Sin nombre en la Agenda</span>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{u.email}</p>
        </div>
      </div>
    );
  }

  function acciones(u: UsersTableRow) {
    const nombre = u.display_name ?? u.email;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${nombre}`} disabled={statusPendingId === u.id} />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setAccion({ tipo: "nombre", user: u })}>
            <Pencil />
            Editar nombre
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAccion({ tipo: "clave", user: u })}>
            <KeyRound />
            Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleStatus(u)}>
            {esActivo(u) ? <Ban /> : <RotateCcw />}
            {esActivo(u) ? "Anular acceso" : "Reactivar acceso"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setAccion({ tipo: "eliminar", user: u })}>
            <Trash2 />
            Eliminar usuario
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const kpis = [
    { label: "Usuarios", value: users.length, className: "text-[#0B2545] dark:text-foreground" },
    { label: "Activos", value: activos, className: "text-emerald-700 dark:text-emerald-400" },
    { label: "Anulados", value: anulados, className: "text-slate-600 dark:text-slate-300" },
    {
      label: "Sin nombre en la Agenda",
      value: sinNombre,
      className: sinNombre > 0 ? "text-amber-700 dark:text-amber-400" : "text-[#0B2545] dark:text-foreground",
      hint: sinNombre > 0 ? "Agrega su correo a un contacto" : undefined,
    },
  ];

  const filtrosEstado: { key: EstadoFiltro; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: users.length },
    { key: "activos", label: "Activos", count: activos },
    { key: "anulados", label: "Anulados", count: anulados },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-1 rounded-2xl border bg-card p-4 shadow-xs">
            <span className="text-sm font-medium text-muted-foreground">{k.label}</span>
            <span className={`text-2xl font-bold tabular-nums sm:text-3xl ${k.className}`}>{k.value}</span>
            {k.hint && <span className="text-xs text-muted-foreground">{k.hint}</span>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-10 w-full items-center gap-2 rounded-xl border bg-card px-3 text-muted-foreground shadow-xs focus-within:ring-3 focus-within:ring-ring/50 sm:w-80">
          <Search className="size-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o correo"
            aria-label="Buscar por nombre o correo"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div role="tablist" aria-label="Estado" className="flex gap-1 rounded-xl border bg-card p-1 shadow-xs">
          {filtrosEstado.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={estado === f.key}
              onClick={() => setEstado(f.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                estado === f.key
                  ? "bg-[#04B1AF]/12 font-semibold text-[#036E6C] dark:bg-[#04B1AF]/20 dark:text-[#5FD6D4]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {f.label}
              <span className="text-xs tabular-nums opacity-80">{f.count}</span>
            </button>
          ))}
        </div>
        <select
          aria-label="Perfil"
          value={perfil}
          onChange={(e) => setPerfil(e.target.value)}
          className="h-10 rounded-xl border bg-card px-3 text-sm shadow-xs"
        >
          <option value="">Todos los perfiles</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {filtrando && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {visibles.length} de {users.length}
          </span>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">{selectedIds.size} usuario(s) seleccionado(s)</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              Quitar selección
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              Eliminar seleccionados
            </Button>
          </div>
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          {query.trim() ? `Ningún usuario coincide con «${query}».` : "Ningún usuario coincide con los filtros."}
        </p>
      ) : (
        <>
          {/* Computer: table */}
          <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-xs md:block">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th className="w-12 py-3 pl-4">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#04B1AF]"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  <th className="py-3 pr-4 font-semibold">Usuario</th>
                  <th className="w-64 py-3 pr-4 font-semibold">Perfil</th>
                  <th className="w-32 py-3 pr-4 font-semibold">Estado</th>
                  <th className="w-14 py-3 pr-4">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => (
                  <tr
                    key={u.id}
                    data-selected={selectedIds.has(u.id)}
                    className="border-t transition-colors hover:bg-muted/40 data-[selected=true]:bg-[#04B1AF]/5"
                  >
                    <td className="py-3 pl-4">
                      <input
                        type="checkbox"
                        className="size-4 accent-[#04B1AF]"
                        checked={selectedIds.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                        aria-label={`Seleccionar ${u.email}`}
                      />
                    </td>
                    <td className="py-3 pr-4">{persona(u, "size-10")}</td>
                    <td className="py-3 pr-4">
                      <RoleProfileSelect userId={u.id} currentProfileId={u.role_profile_id} profiles={profiles} />
                    </td>
                    <td className="py-3 pr-4">
                      <EstadoPill activo={esActivo(u)} />
                    </td>
                    <td className="py-3 pr-4 text-right">{acciones(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: one card per user */}
          <ul className="space-y-2 md:hidden">
            {visibles.map((u) => (
              <li
                key={u.id}
                data-selected={selectedIds.has(u.id)}
                className="space-y-3 rounded-xl border bg-card p-3.5 shadow-xs data-[selected=true]:border-[#04B1AF]/60"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-3 size-4 shrink-0 accent-[#04B1AF]"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggleOne(u.id)}
                    aria-label={`Seleccionar ${u.email}`}
                  />
                  <div className="min-w-0 flex-1">{persona(u, "size-11")}</div>
                  {acciones(u)}
                </div>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <RoleProfileSelect userId={u.id} currentProfileId={u.role_profile_id} profiles={profiles} />
                  </div>
                  <EstadoPill activo={esActivo(u)} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* One dialog at a time, opened from a row's actions menu. */}
      {accion?.tipo === "nombre" && (
        <EditUserDialog
          key={accion.user.id}
          userId={accion.user.id}
          fullName={accion.user.full_name}
          open
          onOpenChange={(open) => {
            if (!open) {
              setAccion(null);
              router.refresh();
            }
          }}
        />
      )}
      {accion?.tipo === "clave" && (
        <SetPasswordDialog
          key={accion.user.id}
          userId={accion.user.id}
          email={accion.user.email}
          open
          onOpenChange={(open) => !open && setAccion(null)}
        />
      )}
      {accion?.tipo === "eliminar" && (
        <DeleteUserDialog
          key={accion.user.id}
          userId={accion.user.id}
          email={accion.user.email}
          open
          onOpenChange={(open) => {
            if (!open) {
              setAccion(null);
              router.refresh();
            }
          }}
        />
      )}

      <Dialog
        open={bulkDeleteOpen}
        onOpenChange={(next) => {
          setBulkDeleteOpen(next);
          if (!next) setBulkError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar {selectedIds.size} usuario(s)?</DialogTitle>
          </DialogHeader>
          {bulkError && <p className="text-sm text-red-600">{bulkError}</p>}
          <p className="text-sm text-muted-foreground">
            Esta acción no se puede deshacer. Perderán acceso a la plataforma de inmediato.
          </p>
          <ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-muted-foreground">
            {selectedEmails.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={isBulkDeleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmBulkDelete} disabled={isBulkDeleting}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
