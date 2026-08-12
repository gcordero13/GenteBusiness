import { createClient } from "@/lib/supabase/server";
import { getBusinessToday, getUpcomingBirthdays, splitTodayBirthdays, type BirthdayContact } from "@/lib/contacts";
import { resolveScheduleLine } from "@/lib/schedules";
import { getScheduleTemplatesContext } from "@/lib/scheduleTemplates";
import { BirthdaysWidget } from "./contacts/BirthdaysWidget";
import type { MyProfileCardData } from "./contacts/MyProfileCard";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "contacts",
  });

  const today = getBusinessToday();
  const todayIso = today.toISOString().slice(0, 10);
  const { data: upcomingEvents } = await supabase
    .from("company_events")
    .select("id, name, event_date")
    .gte("event_date", todayIso)
    .order("event_date")
    .limit(5);

  const { data: activeNews } = await supabase
    .from("company_news")
    .select("id, title, description, image_url, link_url, start_date, end_date")
    .lte("start_date", todayIso)
    .gte("end_date", todayIso)
    .order("start_date")
    .limit(5);

  const { schedulesById, defaultSchedule } = await getScheduleTemplatesContext();
  const { data: departments } = await supabase.from("departments").select("id, default_schedule_id");
  const departmentDefaultById = new Map((departments ?? []).map((d) => [d.id, d.default_schedule_id]));

  let myProfile: MyProfileCardData | null = null;
  if (user?.email) {
    const { data: myContact } = await supabase
      .from("contacts")
      .select("first_name, last_name, position, photo_url, hire_date, schedule_id, department_id")
      .eq("email", user.email)
      .maybeSingle();

    if (myContact) {
      myProfile = {
        name: `${myContact.first_name} ${myContact.last_name}`,
        position: myContact.position,
        photo_url: myContact.photo_url,
        hire_date: myContact.hire_date,
        schedule_line: resolveScheduleLine(
          myContact.schedule_id,
          myContact.department_id ? departmentDefaultById.get(myContact.department_id) : null,
          schedulesById,
          defaultSchedule,
        ),
      };
    }
  }

  let todayBirthdays: BirthdayContact[] = [];
  let upcomingBirthdays: BirthdayContact[] = [];
  if (flagsRows?.[0]?.can_view) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select(
        "id, first_name, last_name, birth_date, photo_url, position, email, extension, fleet_phone, has_whatsapp, hire_date, schedule_id, department_id, companies(name), departments(name)",
      )
      .eq("status", "active");

    const allBirthdayContacts: BirthdayContact[] = (contacts ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      birth_date: c.birth_date,
      photo_url: c.photo_url,
      position: c.position,
      email: c.email,
      extension: c.extension,
      fleet_phone: c.fleet_phone,
      has_whatsapp: c.has_whatsapp,
      hire_date: c.hire_date,
      schedule_line: resolveScheduleLine(
        c.schedule_id,
        c.department_id ? departmentDefaultById.get(c.department_id) : null,
        schedulesById,
        defaultSchedule,
      ),
      company_name: (c.companies as unknown as { name: string } | null)?.name ?? null,
      department_name: (c.departments as unknown as { name: string } | null)?.name ?? null,
    }));

    const split = splitTodayBirthdays(allBirthdayContacts, today);
    todayBirthdays = split.todayBirthdays;
    upcomingBirthdays = getUpcomingBirthdays(split.rest, today, 7);
  }

  return (
    <div className="space-y-4 p-6">
      {!myProfile && (
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Bienvenido</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      )}
      <BirthdaysWidget
        myProfile={myProfile}
        today={today}
        todayContacts={todayBirthdays}
        upcomingContacts={upcomingBirthdays}
        events={upcomingEvents ?? []}
        news={activeNews ?? []}
      />
    </div>
  );
}
