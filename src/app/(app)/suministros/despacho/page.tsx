import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listDispatchQueue } from "../actions";
import { listSupplyArticles } from "../articulos/actions";
import { DespachoQueue } from "./DespachoQueue";

export default async function SupplyDespachoPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "suministros",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const [requests, articles] = await Promise.all([listDispatchQueue(), listSupplyArticles()]);
  const stockByArticleName = new Map(articles.map((a) => [a.name, a.stockQuantity]));

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Despacho de suministros</h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes aprobadas listas para preparar y entregar.
          </p>
        </div>
        <DespachoQueue requests={requests} stockByArticleName={Object.fromEntries(stockByArticleName)} />
      </div>
    </div>
  );
}
