import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSupplyRequestsForBoard } from "../actions";
import { TableroBoard } from "./TableroBoard";

export default async function SupplyRequestsTableroPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "suministros",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const requests = await listSupplyRequestsForBoard();

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tablero de solicitudes</h1>
          <p className="text-sm text-muted-foreground">
            Todas las solicitudes de suministros agrupadas por estado.
          </p>
        </div>
        <TableroBoard requests={requests} />
      </div>
    </div>
  );
}
