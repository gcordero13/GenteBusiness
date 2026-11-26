import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSharePointDownloadUrl } from "@/lib/sharepoint";
import { getSiteUrl } from "@/lib/siteUrl";
import { toCertificadoData, verificacionUrl, type RawCertificado } from "@/lib/aprendizaje/certificado";
import { generateCertificadoPdf } from "@/lib/aprendizaje/certificadoPdf";
import type { DriveFileRef } from "@/lib/aprendizaje/types";

export const runtime = "nodejs";

async function fetchFirma(ref: DriveFileRef | null): Promise<Uint8Array | null> {
  if (!ref) return null;
  try {
    const res = await fetch(await getSharePointDownloadUrl(ref.driveId, ref.itemId));
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null; // The certificate still goes out, with a blank signature line.
  }
}

/**
 * The signed-in person's certificate for a course, generated on the fly.
 * aprendizaje_mi_certificado returns a row only for the caller's own,
 * completed enrollment, so nobody can download someone else's certificate
 * or one for a course they haven't finished.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ cursoId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { cursoId } = await params;
  const { data, error } = await supabase.rpc("aprendizaje_mi_certificado", { p_curso_id: cursoId });
  const row = (data as RawCertificado[] | null)?.[0];
  if (error || !row) {
    return NextResponse.json({ error: "Aún no tienes el certificado de este curso." }, { status: 404 });
  }

  const certificado = toCertificadoData(row);
  const pdf = await generateCertificadoPdf(certificado, {
    qrUrl: verificacionUrl(await getSiteUrl(), certificado.codigo),
    firmaBytes: await fetchFirma(certificado.firmaImagen),
  });

  const filename = `Certificado - ${certificado.curso}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Certificado.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
