import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSupplyArticles } from "./actions";
import { SupplyArticlesTable } from "./SupplyArticlesTable";
import { ArticleFormDialog } from "./ArticleFormDialog";
import { ArticleImportExport } from "./ArticleImportExport";

export default async function SupplyArticlesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "suministros",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const articles = await listSupplyArticles();
  const lowStockCount = articles.filter((a) => a.stockQuantity < a.lowStockThreshold).length;
  const activeCount = articles.filter((a) => a.status === "active").length;
  const categories = new Set(articles.map((a) => a.category).filter(Boolean)).size;
  const inventoryValue = articles.reduce((sum, a) => sum + a.price * a.stockQuantity, 0);

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Artículos de suministros</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo, precios e inventario. Solo visible para el área de Suministros.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <ArticleImportExport />
            <ArticleFormDialog />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Artículos activos</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{activeCount}</p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Con stock bajo</p>
            <p className="mt-2 text-2xl font-bold text-red-600">{lowStockCount}</p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Categorías</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{categories}</p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Valor en inventario</p>
            <p className="mt-2 text-2xl font-bold text-foreground">${inventoryValue.toFixed(2)}</p>
          </div>
        </div>

        <SupplyArticlesTable articles={articles} />
      </div>
    </div>
  );
}
