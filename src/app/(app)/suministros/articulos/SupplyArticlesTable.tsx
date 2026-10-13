"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArticleFormDialog } from "./ArticleFormDialog";
import { setSupplyArticleStatus, type SupplyArticleRow } from "./actions";

export function SupplyArticlesTable({ articles }: { articles: SupplyArticleRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
    );
  }, [articles, query]);

  function toggleStatus(article: SupplyArticleRow) {
    setPendingId(article.id);
    startTransition(async () => {
      await setSupplyArticleStatus(article.id, article.status === "active" ? "inactive" : "active");
      setPendingId(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o código..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artículo</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Alerta en</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No hay artículos que coincidan con la búsqueda.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => {
                const lowStock = a.stockQuantity < a.lowStockThreshold;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                          {a.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.imageUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <ImageOff className="size-3.5 text-muted-foreground" />
                          )}
                        </div>
                        {a.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.code}</TableCell>
                    <TableCell className="text-muted-foreground">{a.category ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{a.unit}</TableCell>
                    <TableCell>${a.price.toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={lowStock ? "font-semibold text-red-600" : ""}>{a.stockQuantity}</span>
                      {lowStock && (
                        <span className="ml-1.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Stock bajo
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.lowStockThreshold}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "active" ? "default" : "secondary"}>
                        {a.status === "active" ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <ArticleFormDialog article={a} />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pendingId === a.id}
                          onClick={() => toggleStatus(a)}
                        >
                          {a.status === "active" ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
