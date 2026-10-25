"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerFlags } from "../actions";

interface ActionResult {
  error?: string;
}

export interface DepartmentLeaderRow {
  id: string;
  appUserId: string;
  userName: string;
  departmentId: string;
  departmentName: string;
}

// general_maintenance_assets hit this same issue earlier today: a table
// with more than one FK into app_users makes an embedded join ambiguous.
// This table only has one (app_user_id), but resolving a real NAME still
// needs the same two-step lookup used everywhere else in this codebase
// (app_users.full_name is rarely populated - resolve via the matching
// contacts row by email instead).
async function buildUserNameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").in("id", userIds);
  if (!users || users.length === 0) return new Map();
  const emails = users.map((u) => u.email);
  const { data: contacts } = await admin.from("contacts").select("email, first_name, last_name").in("email", emails);
  const nameByEmail = new Map((contacts ?? []).map((c) => [c.email, `${c.first_name} ${c.last_name}`]));
  return new Map(users.map((u) => [u.id, nameByEmail.get(u.email) ?? u.email]));
}

export async function listDepartmentLeaders(): Promise<DepartmentLeaderRow[]> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("planificacion_department_leaders")
    .select("id, app_user_id, department_id, departments(name)")
    .order("department_id");
  const rows = data ?? [];
  const nameByUserId = await buildUserNameMap([...new Set(rows.map((r) => r.app_user_id))]);

  return rows.map((r) => {
    const dept = Array.isArray(r.departments) ? r.departments[0] : r.departments;
    return {
      id: r.id,
      appUserId: r.app_user_id,
      userName: nameByUserId.get(r.app_user_id) ?? r.app_user_id,
      departmentId: r.department_id,
      departmentName: dept?.name ?? "",
    };
  });
}

export interface AssignableAppUser {
  id: string;
  name: string;
}

export async function listAssignableAppUsers(): Promise<AssignableAppUser[]> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return [];

  const admin = createAdminClient();
  const { data: users } = await admin.from("app_users").select("id, email").eq("status", "active").order("email");
  if (!users || users.length === 0) return [];
  const nameByUserId = await buildUserNameMap(users.map((u) => u.id));
  return users.map((u) => ({ id: u.id, name: nameByUserId.get(u.id) ?? u.id }));
}

export async function addDepartmentLeader(appUserId: string, departmentId: string): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return { error: "No autorizado" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("planificacion_department_leaders")
    .insert({ app_user_id: appUserId, department_id: departmentId, created_by: user.id });
  if (error) return { error: error.message };

  revalidatePath("/planificacion/lideres");
  return {};
}

export async function removeDepartmentLeader(id: string): Promise<ActionResult> {
  const flags = await callerFlags();
  if (!flags.canAuthorize) return { error: "No autorizado" };

  const admin = createAdminClient();
  const { error } = await admin.from("planificacion_department_leaders").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/planificacion/lideres");
  return {};
}
