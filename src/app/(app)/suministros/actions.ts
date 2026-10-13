"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_LABELS } from "./constants";

interface ActionResult {
  error?: string;
}

export interface ApproverOption {
  id: string;
  name: string;
}

function periodMonthIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

// Walks the requester's own supervisor chain (contacts.reports_to_id),
// collecting every ancestor who also has a platform account — confirmed
// with the user: the approver is chosen from the org chart, not a fixed
// list. Capped at 10 hops as a simple cycle guard.
async function resolveApproverChain(userEmail: string): Promise<ApproverOption[]> {
  const admin = createAdminClient();
  const { data: self } = await admin
    .from("contacts")
    .select("id, reports_to_id")
    .eq("email", userEmail)
    .maybeSingle();
  if (!self?.reports_to_id) return [];

  const chain: ApproverOption[] = [];
  let nextContactId: string | null = self.reports_to_id;
  for (let hop = 0; hop < 10 && nextContactId; hop++) {
    const { data: contact } = await admin
      .from("contacts")
      .select("id, first_name, last_name, email, reports_to_id")
      .eq("id", nextContactId)
      .maybeSingle();
    if (!contact) break;

    if (contact.email) {
      const { data: appUser } = await admin
        .from("app_users")
        .select("id")
        .eq("email", contact.email)
        .eq("status", "active")
        .maybeSingle();
      if (appUser) {
        chain.push({ id: appUser.id, name: `${contact.first_name} ${contact.last_name}` });
      }
    }
    nextContactId = contact.reports_to_id;
  }
  return chain;
}

export interface SupplyRequestContext {
  requesterName: string;
  requesterDepartmentName: string | null;
  approvers: ApproverOption[];
  periodMonth: string;
  periodLabel: string;
  lockedByRequest: { requestNumber: number; status: string } | null;
  pendingException: boolean;
  approvedExceptionAvailable: boolean;
}

export async function getSupplyRequestContext(): Promise<SupplyRequestContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("first_name, last_name, departments(name)")
    .eq("email", user.email)
    .maybeSingle();

  const requesterName = contact ? `${contact.first_name} ${contact.last_name}` : user.email;
  const departments = contact?.departments as unknown as { name: string } | { name: string }[] | null;
  const requesterDepartmentName = (Array.isArray(departments) ? departments[0] : departments)?.name ?? null;

  const approvers = await resolveApproverChain(user.email);

  const now = new Date();
  const periodMonth = periodMonthIso(now);
  const periodLabel = now.toLocaleDateString("es-DO", { month: "long", year: "numeric" });

  const { data: existing } = await admin
    .from("supply_requests")
    .select("request_number, status")
    .eq("requester_app_user_id", user.id)
    .eq("period_month", periodMonth)
    .eq("is_exception", false)
    .not("status", "in", "(rechazada,cancelada)")
    .maybeSingle();

  const { data: exceptions } = await admin
    .from("supply_request_exceptions")
    .select("status")
    .eq("requester_app_user_id", user.id)
    .eq("period_month", periodMonth);
  const pendingException = (exceptions ?? []).some((e) => e.status === "pendiente");
  const approvedExceptionAvailable = (exceptions ?? []).some((e) => e.status === "aprobada");

  return {
    requesterName,
    requesterDepartmentName,
    approvers,
    periodMonth,
    periodLabel: periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1),
    lockedByRequest: existing ? { requestNumber: existing.request_number, status: existing.status } : null,
    pendingException,
    approvedExceptionAvailable,
  };
}

export interface CreateSupplyRequestInput {
  items: { articleId: string; qty: number }[];
  approverAppUserId: string;
  notes: string;
}

export async function createSupplyRequest(input: CreateSupplyRequestInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No autorizado" };
  if (input.items.length === 0) return { error: "Agrega al menos un artículo" };

  const context = await getSupplyRequestContext();
  if (!context) return { error: "No autorizado" };
  if (context.lockedByRequest && !context.approvedExceptionAvailable) {
    return { error: "Ya tienes una solicitud este mes. Solicita una excepción para crear otra." };
  }
  const approver = context.approvers.find((a) => a.id === input.approverAppUserId);
  if (!approver) return { error: "Selecciona un aprobador válido" };

  const admin = createAdminClient();
  const articleIds = input.items.map((i) => i.articleId);
  const { data: articles } = await admin
    .from("supply_articles")
    .select("id, name, unit, price")
    .in("id", articleIds);
  if (!articles || articles.length !== articleIds.length) {
    return { error: "Uno o más artículos ya no están disponibles" };
  }
  const articleById = new Map(articles.map((a) => [a.id, a]));

  const isException = Boolean(context.lockedByRequest) && context.approvedExceptionAvailable;

  const { data: inserted, error } = await supabase
    .from("supply_requests")
    .insert({
      requester_app_user_id: user.id,
      requester_name: context.requesterName,
      requester_department_name: context.requesterDepartmentName,
      period_month: context.periodMonth,
      approver_app_user_id: approver.id,
      approver_name: approver.name,
      notes: input.notes.trim() || null,
      is_exception: isException,
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: error?.message ?? "No se pudo crear la solicitud" };

  const { error: itemsError } = await supabase.from("supply_request_items").insert(
    input.items.map((i) => {
      const article = articleById.get(i.articleId)!;
      return {
        request_id: inserted.id,
        article_id: i.articleId,
        article_name: article.name,
        unit: article.unit,
        unit_price: article.price,
        qty_requested: i.qty,
      };
    }),
  );
  if (itemsError) return { error: itemsError.message };

  revalidatePath("/suministros");
  return {};
}

export async function requestSupplyException(approverAppUserId: string, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };
  if (!note.trim()) return { error: "Explica el motivo de la excepción" };

  const context = await getSupplyRequestContext();
  if (!context) return { error: "No autorizado" };
  const approver = context.approvers.find((a) => a.id === approverAppUserId);
  if (!approver) return { error: "Selecciona un aprobador válido" };
  if (context.pendingException) return { error: "Ya tienes una excepción pendiente este mes" };

  const { error } = await supabase.from("supply_request_exceptions").insert({
    requester_app_user_id: user.id,
    period_month: context.periodMonth,
    note: note.trim(),
    approver_app_user_id: approver.id,
    approver_name: approver.name,
  });
  if (error) return { error: error.message };

  revalidatePath("/suministros");
  return {};
}

async function callerCanManageSuministros(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", { p_module_key: "suministros" });
  return Boolean(data?.[0]?.can_manage);
}

export interface SupplyRequestItemRow {
  id: string;
  articleId: string;
  articleName: string;
  unit: string;
  unitPrice: number;
  qtyRequested: number;
  qtyApproved: number | null;
  qtyPrepared: number | null;
  qtyDelivered: number | null;
}

export interface SupplyRequestRow {
  id: string;
  requestNumber: number;
  requesterName: string;
  requesterDepartmentName: string | null;
  approverName: string;
  status: string;
  statusLabel: string;
  notes: string | null;
  createdAtLabel: string;
  items: SupplyRequestItemRow[];
  isMyApproval: boolean;
}

function toItemRow(i: {
  id: string;
  article_id: string;
  article_name: string;
  unit: string;
  unit_price: number;
  qty_requested: number;
  qty_approved: number | null;
  qty_prepared: number | null;
  qty_delivered: number | null;
}): SupplyRequestItemRow {
  return {
    id: i.id,
    articleId: i.article_id,
    articleName: i.article_name,
    unit: i.unit,
    unitPrice: i.unit_price,
    qtyRequested: i.qty_requested,
    qtyApproved: i.qty_approved,
    qtyPrepared: i.qty_prepared,
    qtyDelivered: i.qty_delivered,
  };
}

// Any employee can end up being someone's approver (the chain is the org
// chart, not a permission flag), so this list is NOT gated behind
// can_manage — it's whatever requests have the current user as approver.
export async function listPendingApprovals(): Promise<SupplyRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("supply_requests")
    .select(
      "id, request_number, requester_name, requester_department_name, approver_name, status, notes, created_at, supply_request_items(id, article_id, article_name, unit, unit_price, qty_requested, qty_approved, qty_prepared, qty_delivered)",
    )
    .eq("approver_app_user_id", user.id)
    .in("status", ["pendiente_aprobacion", "editada_pendiente_reaprobacion"])
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    requestNumber: r.request_number,
    requesterName: r.requester_name,
    requesterDepartmentName: r.requester_department_name,
    approverName: r.approver_name,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
    notes: r.notes,
    createdAtLabel: new Date(r.created_at).toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" }),
    items: (r.supply_request_items as Parameters<typeof toItemRow>[0][]).map(toItemRow),
    isMyApproval: true,
  }));
}

export async function decideSupplyRequest(
  requestId: string,
  decision: "aprobada" | "rechazada",
  itemApprovals: { itemId: string; qtyApproved: number }[],
  reason: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const { data: request } = await supabase
    .from("supply_requests")
    .select("id, approver_app_user_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.approver_app_user_id !== user.id) return { error: "No autorizado" };
  if (!["pendiente_aprobacion", "editada_pendiente_reaprobacion"].includes(request.status)) {
    return { error: "Esta solicitud ya fue procesada" };
  }
  if (decision === "rechazada" && !reason.trim()) return { error: "Indica el motivo del rechazo" };

  if (decision === "aprobada") {
    for (const item of itemApprovals) {
      const { error } = await supabase
        .from("supply_request_items")
        .update({ qty_approved: item.qtyApproved })
        .eq("id", item.itemId)
        .eq("request_id", requestId);
      if (error) return { error: error.message };
    }
  }

  const { error } = await supabase
    .from("supply_requests")
    .update({
      status: decision,
      notes: decision === "rechazada" ? reason.trim() : undefined,
    })
    .eq("id", requestId);
  if (error) return { error: error.message };

  revalidatePath("/suministros");
  revalidatePath("/suministros/tablero");
  revalidatePath("/suministros/despacho");
  return {};
}

export async function listSupplyRequestsForBoard(): Promise<SupplyRequestRow[]> {
  if (!(await callerCanManageSuministros())) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("supply_requests")
    .select(
      "id, request_number, requester_name, requester_department_name, approver_name, status, notes, created_at, supply_request_items(id, article_id, article_name, unit, unit_price, qty_requested, qty_approved, qty_prepared, qty_delivered)",
    )
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    requestNumber: r.request_number,
    requesterName: r.requester_name,
    requesterDepartmentName: r.requester_department_name,
    approverName: r.approver_name,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
    notes: r.notes,
    createdAtLabel: new Date(r.created_at).toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" }),
    items: (r.supply_request_items as Parameters<typeof toItemRow>[0][]).map(toItemRow),
    isMyApproval: false,
  }));
}

export async function listDispatchQueue(): Promise<SupplyRequestRow[]> {
  if (!(await callerCanManageSuministros())) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("supply_requests")
    .select(
      "id, request_number, requester_name, requester_department_name, approver_name, status, notes, created_at, supply_request_items(id, article_id, article_name, unit, unit_price, qty_requested, qty_approved, qty_prepared, qty_delivered)",
    )
    .in("status", ["aprobada", "en_preparacion", "parcial"])
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    requestNumber: r.request_number,
    requesterName: r.requester_name,
    requesterDepartmentName: r.requester_department_name,
    approverName: r.approver_name,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
    notes: r.notes,
    createdAtLabel: new Date(r.created_at).toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" }),
    items: (r.supply_request_items as Parameters<typeof toItemRow>[0][]).map(toItemRow),
    isMyApproval: false,
  }));
}

export async function markRequestInPreparation(requestId: string): Promise<ActionResult> {
  if (!(await callerCanManageSuministros())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("supply_requests")
    .update({ status: "en_preparacion" })
    .eq("id", requestId)
    .eq("status", "aprobada");
  if (error) return { error: error.message };

  revalidatePath("/suministros/despacho");
  revalidatePath("/suministros/tablero");
  return {};
}

// Confirms delivery for the given items (qtyDelivered capped at qtyApproved
// by the caller's UI), decrements stock by what was actually delivered, and
// marks the request 'entregada' when every item is fully delivered or
// 'parcial' otherwise — matches the approved mockup's dispatch workflow.
export async function confirmDispatchDelivery(
  requestId: string,
  deliveries: { itemId: string; articleId: string; qtyPrepared: number; qtyDelivered: number }[],
): Promise<ActionResult> {
  if (!(await callerCanManageSuministros())) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("supply_requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || !["aprobada", "en_preparacion", "parcial"].includes(request.status)) {
    return { error: "Esta solicitud no está en despacho" };
  }

  for (const d of deliveries) {
    const { error: itemError } = await admin
      .from("supply_request_items")
      .update({ qty_prepared: d.qtyPrepared, qty_delivered: d.qtyDelivered })
      .eq("id", d.itemId)
      .eq("request_id", requestId);
    if (itemError) return { error: itemError.message };

    if (d.qtyDelivered > 0) {
      const { data: article } = await admin
        .from("supply_articles")
        .select("stock_quantity")
        .eq("id", d.articleId)
        .maybeSingle();
      if (article) {
        const { error: stockError } = await admin
          .from("supply_articles")
          .update({ stock_quantity: Math.max(0, article.stock_quantity - d.qtyDelivered) })
          .eq("id", d.articleId);
        if (stockError) return { error: stockError.message };
      }
    }
  }

  const { data: items } = await admin
    .from("supply_request_items")
    .select("qty_approved, qty_delivered")
    .eq("request_id", requestId);
  const allDelivered = (items ?? []).every((i) => (i.qty_delivered ?? 0) >= (i.qty_approved ?? 0));
  const anyDelivered = (items ?? []).some((i) => (i.qty_delivered ?? 0) > 0);
  const nextStatus = allDelivered ? "entregada" : anyDelivered ? "parcial" : "en_preparacion";

  const { error } = await admin.from("supply_requests").update({ status: nextStatus }).eq("id", requestId);
  if (error) return { error: error.message };

  revalidatePath("/suministros/despacho");
  revalidatePath("/suministros/tablero");
  return {};
}

export interface MySupplyRequestRow {
  id: string;
  requestNumber: number;
  createdAtLabel: string;
  itemCount: number;
  status: string;
  statusLabel: string;
}

export async function listMySupplyRequests(): Promise<MySupplyRequestRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("supply_requests")
    .select("id, request_number, created_at, status, supply_request_items(id)")
    .eq("requester_app_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (data ?? []).map((r) => ({
    id: r.id,
    requestNumber: r.request_number,
    createdAtLabel: new Date(r.created_at).toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" }),
    itemCount: (r.supply_request_items as { id: string }[]).length,
    status: r.status,
    statusLabel: STATUS_LABELS[r.status] ?? r.status,
  }));
}
