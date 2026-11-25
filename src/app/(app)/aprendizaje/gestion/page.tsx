import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/aprendizaje/types";
import { aprendizajeFlags } from "../actions";
import { listCursosGestion } from "./actions";
import { NuevoCursoDialog } from "./NuevoCursoDialog";

export default async function AprendizajeGestionPage() {
  const flags = await aprendizajeFlags();
  if (!flags.canManage) redirect("/aprendizaje");
  const cursos = await listCursosGestion();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <Link href="/aprendizaje" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Volver al catálogo
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestión de Aprendizaje</h1>
            <p className="text-sm text-muted-foreground">Crea cursos y contenidos de historia, y publícalos.</p>
          </div>
          <NuevoCursoDialog />
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Lecciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cursos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/aprendizaje/gestion/${c.id}`} className="font-medium text-[#04B1AF] hover:underline">
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell>{CATEGORY_LABELS[c.category]}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "publicado" ? "default" : c.status === "borrador" ? "secondary" : "outline"}>
                      {STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.leccionCount}</TableCell>
                </TableRow>
              ))}
              {cursos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Todavía no hay cursos. Crea el primero.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
