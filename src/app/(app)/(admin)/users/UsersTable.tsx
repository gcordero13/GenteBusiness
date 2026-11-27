"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Users as UsersIcon } from "lucide-react";
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

function initialsFor(fullName: string | null, email: string): string {
  const trimmedName = fullName?.trim();
  if (trimmedName) {
    const [first, second] = trimmedName.split(/\s+/);
    return `${first?.[0] ?? ""}${second?.[0] ?? ""}`.toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
}

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

  const visibles = useMemo(() => (query.trim() ? users.filter((u) => coincideUsuario(u, query)) : users), [users, query]);
  const allSelected = visibles.length > 0 && visibles.every((u) => selectedIds.has(u.id));
  const selectedEmails = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)).map((u) => u.email),
    [users, selectedIds],
  );

  // "Select all" applies to the users shown by the search.
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

  function toggleStatus(userId: string, currentStatus: string) {
    setStatusPendingId(userId);
    startStatusTransition(async () => {
      await setUserStatus({ userId, status: currentStatus === "active" ? "deactivated" : "active" });
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
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
        <UsersIcon className="size-8" />
        <p className="text-sm">No hay usuarios todavía.</p>
        <p className="text-xs">Invita al primero con el botón &quot;Invitar usuario&quot;.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-10 w-full items-center gap-2 rounded-lg border bg-card px-3 text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50 sm:w-96">
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
        {query.trim() && (
          <span className="text-sm text-muted-foreground">
            {visibles.length} de {users.length}
          </span>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2">
          <p className="text-sm text-red-700">{selectedIds.size} usuario(s) seleccionado(s)</p>
          <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
            Eliminar seleccionados
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10 py-3">
                <input
                  type="checkbox"
                  className="size-4 accent-[#04B1AF]"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Seleccionar todos"
                />
              </TableHead>
              <TableHead className="py-3">Usuario</TableHead>
              <TableHead className="py-3">Perfil</TableHead>
              <TableHead className="py-3">Estado</TableHead>
              <TableHead className="py-3 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Ningún usuario coincide con «{query}».
                </TableCell>
              </TableRow>
            )}
            {visibles.map((u) => (
              <TableRow key={u.id} data-selected={selectedIds.has(u.id)} className="data-[selected=true]:bg-[#04B1AF]/5">
                <TableCell className="py-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-[#04B1AF]"
                    checked={selectedIds.has(u.id)}
                    onChange={() => toggleOne(u.id)}
                    aria-label={`Seleccionar ${u.email}`}
                  />
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      {u.photo_url && <AvatarImage src={u.photo_url} alt="" />}
                      <AvatarFallback>{initialsFor(u.display_name ?? u.full_name, u.email)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {u.display_name ?? <span className="text-muted-foreground italic">Sin nombre en la Agenda</span>}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <RoleProfileSelect userId={u.id} currentProfileId={u.role_profile_id} profiles={profiles} />
                </TableCell>
                <TableCell className="py-3">
                  <Badge variant={u.status === "active" ? "default" : "secondary"}>
                    {u.status === "active" ? "Activo" : "Anulado"}
                  </Badge>
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <EditUserDialog userId={u.id} fullName={u.full_name} />
                    <SetPasswordDialog userId={u.id} email={u.email} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={statusPendingId === u.id}
                      onClick={() => toggleStatus(u.id, u.status)}
                    >
                      {u.status === "active" ? "Anular" : "Reactivar"}
                    </Button>
                    <DeleteUserDialog userId={u.id} email={u.email} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
