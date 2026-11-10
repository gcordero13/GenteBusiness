import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTenure } from "@/lib/contacts";
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { SolicitudesHeroBanner } from "./SolicitudesHeroBanner";
import { SolicitudesProfileHeader } from "./SolicitudesProfileHeader";
import { SolicitudesSummaryCards } from "./SolicitudesSummaryCards";
import { SolicitudesTicketExplorer } from "./SolicitudesTicketExplorer";
import { resolveSupervisorChain } from "@/lib/resolveVacationSupervisor";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";
import {
  countOwnRequestsInProgress,
  findLastTakenVacation,
  findNextApprovedVacation,
  summarizeApprovedDaysForYear,
  summarizeAwaitingMyApproval,
} from "@/lib/vacationRequestSummary";

export default async function VacationRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "solicitudes_vacaciones",
  });
  const canAuthorize = flagsRows?.[0]?.can_authorize ?? false;

  const { data: requests } = await supabase
    .from("vacation_requests")
    .select("*")
    .order("created_at", { ascending: false });

  // Same email-join pattern already used for the home page's "my profile"
  // card (src/app/(app)/page.tsx) - deliberately without the schedule_id
  // join, since this page has no use for "Horario".
  let myContact: {
    first_name: string;
    last_name: string;
    position: string | null;
    photo_url: string | null;
    hire_date: string | null;
    reports_to_id: string | null;
  } | null = null;
  if (user?.email) {
    const { data } = await supabase
      .from("contacts")
      .select("first_name, last_name, position, photo_url, hire_date, reports_to_id")
      .eq("email", user.email)
      .maybeSingle();
    myContact = data;
  }

  const admin = createAdminClient();
  const supervisorOptions = myContact ? await resolveSupervisorChain(admin, myContact.reports_to_id) : [];

  const { data: signatureRows } = await supabase
    .from("user_signatures")
    .select("id, storage_path")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const signatures: SignatureWithUrl[] = await Promise.all(
    (signatureRows ?? []).map(async (s) => {
      const { data, error } = await supabase.storage.from("user-signatures").createSignedUrl(s.storage_path, 14400);
      if (error) console.error(`Failed to sign URL for signature ${s.id} (${s.storage_path}):`, error.message);
      return { id: s.id, storagePath: s.storage_path, url: data?.signedUrl ?? "" };
    }),
  );

  const attachmentUrlByRequestId = new Map<string, string>();
  await Promise.all(
    (requests ?? [])
      .filter((r) => r.attachment_path)
      .map(async (r) => {
        const { data, error } = await admin.storage
          .from("vacation-request-attachments")
          .createSignedUrl(r.attachment_path, 14400);
        if (error) {
          console.error(`Failed to sign URL for attachment on request ${r.id}:`, error.message);
          return;
        }
        if (data?.signedUrl) attachmentUrlByRequestId.set(r.id, data.signedUrl);
      }),
  );

  const today = new Date();
  const year = today.getFullYear();
  const todayIso = today.toISOString().slice(0, 10);

  const allRequests = requests ?? [];
  const inProgressCount = countOwnRequestsInProgress(allRequests, user!.id);
  const approval = summarizeAwaitingMyApproval(allRequests, user!.id, canAuthorize);
  const approvedDays = summarizeApprovedDaysForYear(allRequests, user!.id, year);
  const lastVacation = findLastTakenVacation(allRequests, user!.id, todayIso);
  const nextVacation = findNextApprovedVacation(allRequests, user!.id, todayIso);

  // The profile sidebar shows "Última vacación" itself, so the summary
  // cards only need it as a fallback when there's no sidebar to show it in
  // (no matching contacts row for this user).
  const content = (
    <div className="space-y-6">
      <SolicitudesHeroBanner>
        <NewVacationRequestDialog
          triggerClassName="border-transparent bg-white text-teal-800 shadow-md hover:bg-white/90"
          supervisorOptions={supervisorOptions}
        />
      </SolicitudesHeroBanner>
      <SolicitudesSummaryCards
        year={year}
        inProgressCount={inProgressCount}
        approval={approval}
        approvedDays={approvedDays}
        lastVacation={myContact ? null : lastVacation}
        nextVacation={nextVacation}
      />
      <SolicitudesTicketExplorer
        requests={allRequests}
        attachmentUrlByRequestId={Object.fromEntries(attachmentUrlByRequestId)}
        signatures={signatures}
        userId={user!.id}
        canAuthorize={canAuthorize}
      />
    </div>
  );

  return (
    <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8">
      {myContact ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          <SolicitudesProfileHeader
            name={`${myContact.first_name} ${myContact.last_name}`}
            position={myContact.position}
            photoUrl={myContact.photo_url}
            tenure={myContact.hire_date ? formatTenure(myContact.hire_date, today) : null}
            lastVacation={lastVacation}
          />
          {content}
        </div>
      ) : (
        content
      )}
    </div>
  );
}
