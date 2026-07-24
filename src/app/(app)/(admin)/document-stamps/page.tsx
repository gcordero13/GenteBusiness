import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PdfStamperToolClient } from "./PdfStamperToolClient";
import { SealsManager } from "./SealsManager";

export interface SealWithUrl {
  id: string;
  name: string;
  storagePath: string;
  companyName: string;
  url: string;
}

export interface SignatureWithUrl {
  id: string;
  storagePath: string;
  url: string;
}

export default async function DocumentStampsPage() {
  const supabase = await createClient();
  const { data: flagsRows } = await supabase.rpc("get_my_module_permissions", {
    p_module_key: "document_stamps",
  });
  if (!flagsRows?.[0]?.can_add) {
    redirect("/");
  }

  const { data: companies } = await supabase.from("companies").select("id, name").order("name");

  const { data: seals } = await supabase
    .from("company_seals")
    .select("id, name, storage_path, companies(name)")
    .order("name");

  const sealsWithUrls: SealWithUrl[] = await Promise.all(
    (seals ?? []).map(async (s) => {
      const { data, error } = await supabase.storage
        .from("company-seals")
        .createSignedUrl(s.storage_path, 14400);
      if (error) console.error(`Failed to sign URL for seal ${s.id} (${s.storage_path}):`, error.message);
      return {
        id: s.id,
        name: s.name,
        storagePath: s.storage_path,
        companyName: (s.companies as unknown as { name: string } | null)?.name ?? "",
        url: data?.signedUrl ?? "",
      };
    }),
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: signatures } = await supabase
    .from("user_signatures")
    .select("id, storage_path")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const signaturesWithUrls: SignatureWithUrl[] = await Promise.all(
    (signatures ?? []).map(async (s) => {
      const { data, error } = await supabase.storage
        .from("user-signatures")
        .createSignedUrl(s.storage_path, 14400);
      if (error) console.error(`Failed to sign URL for signature ${s.id} (${s.storage_path}):`, error.message);
      return { id: s.id, storagePath: s.storage_path, url: data?.signedUrl ?? "" };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Sellos y Firmas</h1>
      <p className="text-sm text-muted-foreground">
        Carga un PDF, agrégale sellos, firmas o texto, y descárgalo. El documento nunca se sube a
        la plataforma — solo se procesa en tu navegador.
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <PdfStamperToolClient seals={sealsWithUrls} signatures={signaturesWithUrls} />
        <div className="lg:sticky lg:top-6">
          <SealsManager companies={companies ?? []} seals={sealsWithUrls} />
        </div>
      </div>
    </div>
  );
}
