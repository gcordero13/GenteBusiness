import type { Metadata } from "next";
import { BadgeCheck, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fechaCertificado } from "@/lib/aprendizaje/certificado";
import { CERTIFICADO_LOGO_PNG_BASE64 } from "@/lib/aprendizaje/certificadoLogo";

export const metadata: Metadata = {
  title: "Verificar certificado",
  robots: { index: false, follow: false },
};

interface Verificacion {
  nombre: string;
  curso_title: string;
  completed_at: string;
}

/**
 * Public page behind the certificate's QR (no login). It only confirms the
 * certificate: name, course and completion date, nothing else about the person.
 */
export default async function VerificarCertificadoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const codigoLimpio = decodeURIComponent(codigo).trim().toUpperCase();
  const supabase = await createClient();
  const { data } = await supabase.rpc("aprendizaje_verificar_certificado", { p_codigo: codigoLimpio });
  const certificado = (data as Verificacion[] | null)?.[0] ?? null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-[#0B2545] via-[#036E6C] to-[#04B1AF] p-4">
      <div className="w-full max-w-md min-w-0 space-y-6 rounded-2xl bg-white p-5 text-center text-slate-900 shadow-xl sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI */}
        <img
          src={`data:image/png;base64,${CERTIFICADO_LOGO_PNG_BASE64}`}
          alt="Sánchez Business & Corp"
          className="mx-auto h-20 w-auto max-w-full sm:h-24"
        />
        {certificado ? (
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#04B1AF]/10 px-3 py-1 text-sm font-semibold text-[#036E6C]">
              <BadgeCheck className="size-4" />
              Certificado válido
            </p>
            <h1 className="text-xl font-bold [overflow-wrap:anywhere] text-[#0B2545] sm:text-2xl">{certificado.nombre}</h1>
            <p className="text-sm text-slate-600">
              completó el curso
              <span className="mt-1 block text-lg font-semibold [overflow-wrap:anywhere] text-[#0B2545]">
                {certificado.curso_title}
              </span>
              el {fechaCertificado(certificado.completed_at)}
            </p>
            <p className="font-mono text-xs text-slate-500">Código {codigoLimpio}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              <SearchX className="size-4" />
              Sin coincidencias
            </p>
            <h1 className="text-xl font-bold text-[#0B2545]">No encontramos este certificado</h1>
            <p className="text-sm text-slate-600">Revisa el código o escanea de nuevo el QR.</p>
          </div>
        )}
        <p className="text-xs text-slate-500">Gente Sánchez Business · Aprende</p>
      </div>
    </main>
  );
}
