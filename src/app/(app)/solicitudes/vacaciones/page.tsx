import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewVacationRequestDialog } from "./NewVacationRequestDialog";
import { SolicitudesSummaryCards } from "./SolicitudesSummaryCards";
import { SolicitudesTable } from "./SolicitudesTable";
import type { SignatureWithUrl } from "@/app/(app)/(admin)/document-stamps/page";
import {
  countOwnRequestsInProgress,
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

  // Signed URLs for any request that has an attachment_path - same pattern
  // as the signatures above, just keyed by request id instead of signature
  // id since there's at most one attachment per request.
  const attachmentUrlByRequestId = new Map<string, string>();
  const admin = createAdminClient();
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
  const nextVacation = findNextApprovedVacation(allRequests, user!.id, todayIso);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Solicitudes de permisos</h1>
        <NewVacationRequestDialog />
      </div>
      <SolicitudesSummaryCards
        year={year}
        inProgressCount={inProgressCount}
        approval={approval}
        approvedDays={approvedDays}
        nextVacationDate={nextVacation?.date_from ?? null}
      />
      <SolicitudesTable
        requests={allRequests}
        attachmentUrlByRequestId={Object.fromEntries(attachmentUrlByRequestId)}
        signatures={signatures}
        userId={user!.id}
        canAuthorize={canAuthorize}
      />
    </div>
  );
}
