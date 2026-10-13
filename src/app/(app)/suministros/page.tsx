import { listSupplyArticles } from "./articulos/actions";
import { getSupplyRequestContext, listMySupplyRequests, listPendingApprovals } from "./actions";
import { SupplyRequestForm } from "./SupplyRequestForm";
import { RequestExceptionDialog } from "./RequestExceptionDialog";
import { ApprovalsPanel } from "./ApprovalsPanel";

export default async function SupplyRequestPage() {
  const [articles, context, recent, pendingApprovals] = await Promise.all([
    listSupplyArticles({ activeOnly: true }),
    getSupplyRequestContext(),
    listMySupplyRequests(),
    listPendingApprovals(),
  ]);

  if (!context) {
    return null;
  }

  const isLocked = Boolean(context.lockedByRequest) && !context.approvedExceptionAvailable;

  return (
    <div className="min-h-full bg-gradient-to-b from-[#04B1AF]/[0.06] via-transparent to-transparent">
      <div className="w-full min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Solicitud de Suministros</h1>
          <p className="text-sm text-muted-foreground">
            Solicita materiales y consulta el estado de tus pedidos en un solo lugar.
          </p>
        </div>

        {isLocked && context.lockedByRequest && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">Ya tienes una solicitud este mes</p>
              <p className="text-xs text-amber-800">
                #{context.lockedByRequest.requestNumber} · Solo se permite 1 solicitud por mes ({context.periodLabel})
              </p>
            </div>
            {context.pendingException ? (
              <span className="text-xs font-semibold text-amber-800">Excepción enviada, esperando respuesta</span>
            ) : (
              <RequestExceptionDialog approvers={context.approvers} />
            )}
          </div>
        )}

        <ApprovalsPanel requests={pendingApprovals} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Mis solicitudes</p>
            <p className="mt-2 text-2xl font-bold text-foreground">{recent.length}</p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Aprobadas</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {recent.filter((r) => r.status === "aprobada" || r.status === "entregada").length}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">Pendientes</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {recent.filter((r) => r.status === "pendiente_aprobacion").length}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground">En entrega</p>
            <p className="mt-2 text-2xl font-bold text-foreground">
              {recent.filter((r) => r.status === "en_preparacion" || r.status === "parcial").length}
            </p>
          </div>
        </div>

        {isLocked ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">
              Ya enviaste tu solicitud de {context.periodLabel}. Podrás crear una nueva el próximo mes, o solicita
              una excepción arriba.
            </p>
          </div>
        ) : (
          <SupplyRequestForm articles={articles} approvers={context.approvers} />
        )}

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Mis solicitudes recientes</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no has hecho ninguna solicitud.</p>
          ) : (
            <div className="space-y-2.5">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-semibold text-foreground">#{r.requestNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.createdAtLabel} · {r.itemCount} artículo{r.itemCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                    {r.statusLabel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
