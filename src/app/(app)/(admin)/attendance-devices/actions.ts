"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DeviceFields {
  name: string;
  ipAddress: string;
  username: string;
  password: string;
  isActive: boolean;
}

async function callerCanManageAttendanceDevices(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "attendance_devices",
  });
  return Boolean(data?.[0]?.can_manage);
}

export async function saveDevice(id: string | undefined, fields: DeviceFields) {
  if (!(await callerCanManageAttendanceDevices())) {
    return { error: "No autorizado" };
  }

  const admin = createAdminClient();
  const payload = {
    name: fields.name,
    ip_address: fields.ipAddress,
    username: fields.username,
    password: fields.password,
    is_active: fields.isActive,
  };

  const query = id
    ? admin.from("time_clock_devices").update(payload).eq("id", id)
    : admin.from("time_clock_devices").insert(payload);

  const { error } = await query;
  if (error) return { error: error.message };

  revalidatePath("/attendance-devices");
  return {};
}
