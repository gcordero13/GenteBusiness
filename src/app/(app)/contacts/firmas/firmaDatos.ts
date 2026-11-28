// Email signatures in "Mi perfil" (user request, 2026-11-27): one design per
// company of the group, filled with the person's own contact data. Plain
// module (no "use client"), so the rules can be unit-tested.

export type Plantilla = "sbc" | "jsc" | "kexford";

export interface MarcaFirma {
  /** Main office number; the person's extension is appended. */
  telefonoOficina: string;
  web: string;
  redes: ("facebook" | "instagram" | "linkedin")[];
  usuarioRedes: string;
}

/** Each company's fixed signature data, as in its current signatures. */
export const MARCAS: Record<Plantilla, MarcaFirma> = {
  sbc: {
    telefonoOficina: "809-468-1600",
    web: "sanchezbusinesscorp.com",
    redes: ["facebook", "instagram", "linkedin"],
    usuarioRedes: "@sanchezbusinesscorp",
  },
  jsc: {
    telefonoOficina: "809-468-1600",
    web: "www.josesanchezcomercial.com",
    redes: ["instagram", "facebook"],
    usuarioRedes: "@jsanchezcomercial",
  },
  kexford: {
    telefonoOficina: "809-468-1600",
    web: "Kexford Punta Cana",
    redes: [],
    usuarioRedes: "@kexfordpc",
  },
};

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** The design for a company: Kexford, José Sánchez Comercial, else Sánchez Business & Corp. */
export function plantillaDeEmpresa(empresa: string | null | undefined): Plantilla {
  const n = normalizar(empresa ?? "");
  if (n.includes("kexford")) return "kexford";
  if (n.includes("jose sanchez") || n.includes("comercial")) return "jsc";
  return "sbc";
}

/** "8295213235" → "829-521-3235"; anything else is left as typed. */
export function formatoTelefono(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : raw.trim();
}

export interface PersonaFirma {
  nombre: string;
  apellido: string;
  puesto: string | null;
  email: string | null;
  extension: string | null;
  celular: string | null;
  tieneWhatsapp: boolean;
  fotoUrl: string | null;
}

export type IconoLinea = "whatsapp" | "celular" | "telefono" | "correo" | "web" | "usuario";

export interface LineaFirma {
  icono: IconoLinea;
  texto: string;
}

/**
 * The contact lines of a signature, in each design's own order. Lines whose
 * data the person doesn't have are left out.
 */
export function lineasFirma(p: PersonaFirma, plantilla: Plantilla): LineaFirma[] {
  const marca = MARCAS[plantilla];
  const celular = p.celular?.trim()
    ? { icono: (p.tieneWhatsapp ? "whatsapp" : "celular") as IconoLinea, texto: formatoTelefono(p.celular) }
    : null;
  const oficina = {
    icono: "telefono" as IconoLinea,
    texto: p.extension?.trim() ? `${marca.telefonoOficina} ext. ${p.extension.trim()}` : marca.telefonoOficina,
  };
  const correo = p.email?.trim() ? { icono: "correo" as IconoLinea, texto: p.email.trim() } : null;
  const web = { icono: "web" as IconoLinea, texto: marca.web };

  const lineas =
    plantilla === "kexford"
      ? [celular, oficina, web, { icono: "usuario" as IconoLinea, texto: marca.usuarioRedes }, correo]
      : [celular, oficina, correo, web];
  return lineas.filter((l): l is LineaFirma => l !== null);
}

/** File name of the downloaded signature, e.g. "Firma - Ana Pérez (con foto).png". */
export function nombreArchivoFirma(p: Pick<PersonaFirma, "nombre" | "apellido">, conFoto: boolean): string {
  return `Firma - ${`${p.nombre} ${p.apellido}`.trim()} (${conFoto ? "con foto" : "sin foto"}).png`;
}
