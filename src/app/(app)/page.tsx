import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessToday, getUpcomingBirthdays, splitTodayBirthdays, type BirthdayContact } from "@/lib/contacts";
import { getEffectiveSchedule, resolveScheduleLine } from "@/lib/schedules";
import { getScheduleTemplatesContext } from "@/lib/scheduleTemplates";
import {
  deriveDailyArrivals,
  averageArrivalMinutes,
  formatArrivalTime,
  attachScheduleComparison,
  averageMinutesEarly,
  classifyArrivalTier,
  pickMotivationalPhrase,
  rankEarlyArrivals,
  scheduleTimeToMinutes,
  type EarlyArrivalCandidate,
} from "@/lib/attendance";
import { BirthdaysWidget } from "./contacts/BirthdaysWidget";
import type { MyProfileCardData } from "./contacts/MyProfileCard";
import {
  AttendanceSummaryCards,
  type AttendanceCard1Data,
  type AttendanceCard2Data,
  type AttendanceTopArrival,
} from "./AttendanceSummaryCards";

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
  let attendanceCards: {
    card1: AttendanceCard1Data;
    card2: AttendanceCard2Data;
    topArrivals: AttendanceTopArrival[];
  } | null = null;
  if (user?.email) {
    const { data: myContact } = await supabase
      .from("contacts")
      .select("first_name, last_name, position, photo_url, hire_date, schedule_id, department_id, hikvision_employee_no")
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

    if (myContact?.hikvision_employee_no) {
      // Bypasses RLS deliberately for these attendance queries only: time_clock_punches
      // has no SELECT policy at all, and the Card 3 candidate list is intentionally
      // company-wide with no permission gate (a spec decision, not an oversight) - see
      // the "time_clock_punches access" / "contacts access for Card 3" notes in
      // docs/superpowers/specs/2026-08-11-attendance-summary-cards-design.md.
      const admin = createAdminClient();
      const windowStartIso = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();

      const { data: myPunches } = await admin
        .from("time_clock_punches")
        .select("punched_at")
        .eq("employee_no_string", myContact.hikvision_employee_no)
        .gte("punched_at", windowStartIso);

      const myArrivals = deriveDailyArrivals((myPunches ?? []).map((p) => p.punched_at));
      const monthStartIso = `${todayIso.slice(0, 7)}-01`;
      const monthlyArrivals = myArrivals.filter((a) => a.dateIso >= monthStartIso);
      const avgArrivalMinutes = averageArrivalMinutes(monthlyArrivals);

      const viewerSchedule = getEffectiveSchedule(
        myContact.schedule_id,
        myContact.department_id ? departmentDefaultById.get(myContact.department_id) : null,
        schedulesById,
        defaultSchedule,
      );
      const monthlyComparison = attachScheduleComparison(monthlyArrivals, viewerSchedule);
      const avgMinutesEarly = averageMinutesEarly(monthlyComparison);

      let phrase: string | null = null;
      if (avgMinutesEarly !== null) {
        const tier = classifyArrivalTier(avgMinutesEarly, viewerSchedule.tolerance_minutes);
        phrase = pickMotivationalPhrase(tier, myContact.first_name, today.getUTCDate());
      }

      const todayComparison = monthlyComparison.find((a) => a.dateIso === todayIso) ?? null;

      const card1: AttendanceCard1Data = {
        averageArrivalLabel: avgArrivalMinutes === null ? null : formatArrivalTime(avgArrivalMinutes),
        phrase,
      };
      const card2: AttendanceCard2Data = {
        arrivalLabel: todayComparison === null ? null : formatArrivalTime(todayComparison.arrivalMinutes),
        minutesEarly: todayComparison?.minutesEarly ?? null,
      };

      const { data: candidateContacts } = await admin
        .from("contacts")
        .select("id, first_name, last_name, photo_url, schedule_id, department_id, hikvision_employee_no")
        .eq("status", "active")
        .not("hikvision_employee_no", "is", null);

      const employeeNumbers = (candidateContacts ?? [])
        .map((c) => c.hikvision_employee_no)
        .filter((no): no is string => Boolean(no));

      const punchesByEmployeeNo = new Map<string, string[]>();
      if (employeeNumbers.length > 0) {
        const { data: allPunches } = await admin
          .from("time_clock_punches")
          .select("employee_no_string, punched_at")
          .in("employee_no_string", employeeNumbers)
          .gte("punched_at", windowStartIso);
        for (const punch of allPunches ?? []) {
          const list = punchesByEmployeeNo.get(punch.employee_no_string) ?? [];
          list.push(punch.punched_at);
          punchesByEmployeeNo.set(punch.employee_no_string, list);
        }
      }

      const todayDayOfWeek = today.getUTCDay();
      const candidates: EarlyArrivalCandidate[] = [];
      for (const c of candidateContacts ?? []) {
        const employeeNo = c.hikvision_employee_no as string;
        const arrivals = deriveDailyArrivals(punchesByEmployeeNo.get(employeeNo) ?? []);
        const todayArrival = arrivals.find((a) => a.dateIso === todayIso);
        if (!todayArrival) continue;

        const contactSchedule = getEffectiveSchedule(
          c.schedule_id,
          c.department_id ? departmentDefaultById.get(c.department_id) : null,
          schedulesById,
          defaultSchedule,
        );
        const scheduledDay = contactSchedule.days.find((d) => d.day_of_week === todayDayOfWeek);
        if (!scheduledDay) continue;

        candidates.push({
          contactId: c.id,
          name: `${c.first_name} ${c.last_name}`,
          photoUrl: c.photo_url,
          arrivalMinutes: todayArrival.arrivalMinutes,
          scheduledStartMinutes: scheduleTimeToMinutes(scheduledDay.start_time),
        });
      }

      const topArrivals: AttendanceTopArrival[] = rankEarlyArrivals(candidates, 5).map((r) => ({
        contactId: r.contactId,
        name: r.name,
        photoUrl: r.photoUrl,
        arrivalLabel: formatArrivalTime(r.arrivalMinutes),
        minutesEarly: r.minutesEarly,
      }));

      attendanceCards = { card1, card2, topArrivals };
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
      {attendanceCards && (
        <AttendanceSummaryCards
          card1={attendanceCards.card1}
          card2={attendanceCards.card2}
          topArrivals={attendanceCards.topArrivals}
        />
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
