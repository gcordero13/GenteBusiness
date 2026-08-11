import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScheduleForm } from "./ScheduleForm";

export default async function SchedulesPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "schedules",
  });
  if (!flagsRows?.[0]?.can_manage) {
    redirect("/");
  }

  const { data: schedule } = await supabase
    .from("company_schedule")
    .select("start_time, end_time, workdays, tolerance_minutes")
    .eq("id", true)
    .single();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Horarios</h1>
      <p className="text-sm text-muted-foreground">
        Define el horario por defecto de la empresa. Cada contacto puede tener su propio horario
        personalizado desde su página de edición.
      </p>
      <ScheduleForm
        initial={{
          start_time: schedule?.start_time ?? "08:00:00",
          end_time: schedule?.end_time ?? "17:00:00",
          workdays: schedule?.workdays ?? [1, 2, 3, 4, 5],
          tolerance_minutes: schedule?.tolerance_minutes ?? 0,
        }}
      />
    </div>
  );
}
