"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

const STATUS_LABELS: Record<string, string> = {
  pendiente_aprobacion: "En revisión",
  aprobada: "Aprobada",
  editada_pendiente_reaprobacion: "Editada · Re-aprobación",
  rechazada: "Rechazada",
  en_preparacion: "En preparación",
  parcial: "Parcial",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

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
