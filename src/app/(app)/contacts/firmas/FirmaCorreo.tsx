"use client";

// The three email-signature designs of the group (from the user's current
// signatures, 2026-11-27), drawn at the images' exact size (1004 × 590) with
// inline styles so the PNG export matches the preview.
//
// When the company has its signature art uploaded in Empresas (`fondo`: the
// background with its logos, without name, photo or data), it is the background
// and only the photo and the person's data go on top (no logo: "sin foto" is the
// art with the data); otherwise the design is
// drawn here, with the logos from Empresas.
/* eslint-disable @next/next/no-img-element -- exported to PNG with html-to-image; next/image can't be used */
import type { CSSProperties } from "react";
import { lineasFirma, MARCAS, type PersonaFirma, type Plantilla } from "./firmaDatos";
import { IconoLineaFirma, IconoRed } from "./IconosFirma";

export const FIRMA_ANCHO = 1004;
export const FIRMA_ALTO = 590;

const BLANCO: CSSProperties = { filter: "brightness(0) invert(1)" };
/** Logos with a white box blend into the light designs. */
const MULTIPLICAR: CSSProperties = { mixBlendMode: "multiply" };

export interface FirmaProps {
  persona: PersonaFirma;
  plantilla: Plantilla;
  conFoto: boolean;
  /** The company's signature art (Empresas), or null to draw the design. */
  fondo: string | null;
  /** The person's company logo (from Empresas). */
  logoEmpresa: string | null;
  /** Sánchez Business & Corp's logo, for "Una marca del grupo". */
  logoGrupo: string | null;
  /** The other companies' logos, for the group strip of the dark design. */
  logosGrupo: string[];
  /** Font class names (fuentes.ts, loaded on the server). */
  fuentes: { texto: string; nombre: string };
}

/** Name size that keeps long names inside the design. */
function tamanoNombre(nombre: string, base: number): number {
  if (nombre.length > 30) return Math.round(base * 0.72);
  if (nombre.length > 24) return Math.round(base * 0.84);
  return base;
}

function abs(style: CSSProperties): CSSProperties {
  return { position: "absolute", ...style };
}

function Fondo({ src }: { src: string }) {
  return <img src={src} alt="" crossOrigin="anonymous" style={abs({ left: 0, top: 0, width: FIRMA_ANCHO, height: FIRMA_ALTO, objectFit: "cover" })} />;
}

function Foto({ url, left, top, size }: { url: string; left: number; top: number; size: number }) {
  return (
    <div style={abs({ left, top, width: size, height: size, borderRadius: "50%", overflow: "hidden", background: "#8c8f94" })}>
      <img src={url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

export function FirmaCorreo(props: FirmaProps) {
  if (props.plantilla === "jsc") return <FirmaJsc {...props} />;
  if (props.plantilla === "kexford") return <FirmaKexford {...props} />;
  return <FirmaSbc {...props} />;
}

// ---------------------------------------------------------------------------
// Sánchez Business & Corp: dark gradient, rounded band, photo circle, teal
// divider, the group's logos at the bottom. Positions measured on the
// company's own 1637 × 961 template, scaled to 1004 × 590.
function FirmaSbc({ fuentes, persona, conFoto, fondo, logoEmpresa, logosGrupo }: FirmaProps) {
  const foto = conFoto && persona.fotoUrl;
  const texto = 528;
  const nombre = `${persona.nombre} ${persona.apellido}`.trim();
  const marca = MARCAS.sbc;

  return (
    <div
      className={fuentes.texto}
      style={{
        width: FIRMA_ANCHO,
        height: FIRMA_ALTO,
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(115deg, #7b7b7b 0%, #4b4b4b 36%, #262626 70%, #1b1b1b 100%)",
        color: "#f4f4f4",
      }}
    >
      {fondo ? (
        <Fondo src={fondo} />
      ) : (
        <>
          <div style={abs({ left: 600, top: -60, width: 420, height: 420, border: "64px solid rgba(255,255,255,0.05)", borderRadius: 36, transform: "rotate(45deg)" })} />
          <div style={abs({ left: 820, top: 200, width: 300, height: 300, border: "52px solid rgba(255,255,255,0.05)", borderRadius: 28, transform: "rotate(45deg)" })} />
          {logoEmpresa && <img src={logoEmpresa} alt="" crossOrigin="anonymous" style={{ ...abs({ left: 180, top: 22, height: 88 }), ...BLANCO }} />}
          <div style={abs({ left: 57, top: 117, width: FIRMA_ANCHO - 57, height: 378, background: "#2b2b2b", borderTopLeftRadius: 189, borderBottomLeftRadius: 189 })} />
          <div style={abs({ left: 80, top: 136, width: 338, height: 338, borderRadius: "50%", background: "#353535" })} />
          <div style={abs({ left: 494, top: 149, width: 3, height: 321, background: "#1ed3e0" })} />
          {logosGrupo.length > 0 && (
            <div style={abs({ left: 500, top: 510, width: 480, height: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 20 })}>
              {/* On white chips: some logos have a white box that a white filter would blank out. */}
              {logosGrupo.map((src) => (
                <span key={src} style={{ height: 52, padding: "4px 12px", boxSizing: "border-box", borderRadius: 10, background: "#fff", display: "flex", alignItems: "center" }}>
                  <img src={src} alt="" crossOrigin="anonymous" style={{ height: 44, maxWidth: 120, objectFit: "contain" }} />
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {foto ? (
        <Foto url={persona.fotoUrl!} left={80} top={136} size={338} />
      ) : (
        !fondo && logoEmpresa && (
          <img
            src={logoEmpresa}
            alt=""
            crossOrigin="anonymous"
            style={{ ...abs({ left: 125, top: 185, width: 248, height: 238, objectFit: "contain" }), ...BLANCO }}
          />
        )
      )}

      <div style={abs({ left: texto, top: 146, width: FIRMA_ANCHO - texto - 24 })}>
        <div className={fuentes.nombre} style={{ fontSize: tamanoNombre(nombre, 44), fontWeight: 700, lineHeight: 1.1 }}>
          {nombre}
        </div>
        {persona.puesto && <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, color: "#22AFC7" }}>{persona.puesto}</div>}
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {lineasFirma(persona, "sbc").map((l) => (
            <div key={l.icono} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 20 }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IconoLineaFirma icono={l.icono} color="#2b2b2b" size={20} />
              </span>
              <span style={{ whiteSpace: "nowrap" }}>{l.texto}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 20 }}>
            {marca.redes.map((r) => (
              <IconoRed key={r} red={r} color="#fff" size={32} />
            ))}
            <span style={{ marginLeft: 8 }}>{marca.usuarioRedes}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ferretería José Sánchez Comercial: white and blue, orange contact band.
function FirmaJsc({ fuentes, persona, conFoto, fondo, logoEmpresa, logoGrupo }: FirmaProps) {
  const foto = conFoto && persona.fotoUrl;
  const nombre = `${persona.nombre} ${persona.apellido}`.trim();
  const marca = MARCAS.jsc;
  const naranja = "#F28C28";
  const azul = "#1B75BC";

  return (
    <div
      className={fuentes.texto}
      style={{ width: FIRMA_ANCHO, height: FIRMA_ALTO, position: "relative", overflow: "hidden", background: "#fff" }}
    >
      {fondo ? (
        <Fondo src={fondo} />
      ) : (
        <>
          {/* Only the edges of the big "C" arcs show, at the left border. */}
          <div style={abs({ left: -470, top: -150, width: 580, height: 580, boxSizing: "border-box", borderRadius: "50%", border: `62px solid ${naranja}` })} />
          <div style={abs({ left: -520, top: 110, width: 560, height: 560, boxSizing: "border-box", borderRadius: "50%", border: `62px solid ${azul}` })} />
          <div style={abs({ left: -470, top: 400, width: 560, height: 560, boxSizing: "border-box", borderRadius: "50%", border: `62px solid ${naranja}` })} />
          <div style={abs({ left: 495, top: 0, width: FIRMA_ANCHO - 495, height: FIRMA_ALTO, background: azul })} />
          <div style={abs({ left: 495, top: 0, width: 45, height: FIRMA_ALTO, background: "#155f9c" })} />
          {logoEmpresa && foto && (
            <img src={logoEmpresa} alt="" crossOrigin="anonymous" style={{ ...abs({ left: 120, top: 45, width: 240, height: 85, objectFit: "contain" }), ...MULTIPLICAR }} />
          )}
          <div style={abs({ left: 137, top: 492, display: "flex", alignItems: "center", gap: 12 })}>
            <span style={{ fontSize: 14, fontStyle: "italic", color: "#555" }}>Una marca del grupo</span>
            {logoGrupo && <img src={logoGrupo} alt="" crossOrigin="anonymous" style={{ height: 62, objectFit: "contain", ...MULTIPLICAR }} />}
          </div>
          <div style={{ ...abs({ left: 440, top: 178, width: 55, height: 30, background: "#c2651a" }), clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }} />
          <div style={abs({ left: 440, top: 208, width: FIRMA_ANCHO - 440, height: 262, background: naranja })} />
          <div style={{ ...abs({ left: 440, top: 470, width: 55, height: 30, background: "#c2651a" }), clipPath: "polygon(0 0, 100% 0, 100% 100%)" }} />
        </>
      )}

      {foto ? (
        <Foto url={persona.fotoUrl!} left={105} top={168} size={260} />
      ) : (
        !fondo && logoEmpresa && (
          <img src={logoEmpresa} alt="" crossOrigin="anonymous" style={{ ...abs({ left: 110, top: 160, width: 300, height: 220, objectFit: "contain" }), ...MULTIPLICAR }} />
        )
      )}

      <div style={abs({ left: 558, top: 70, width: 420, color: "#fff" })}>
        <div style={{ fontSize: tamanoNombre(nombre, 40), fontWeight: 700, lineHeight: 1.15 }}>{nombre}</div>
        {persona.puesto && <div style={{ marginTop: 6, fontSize: 19, fontWeight: 600, color: "#3EC3F5" }}>{persona.puesto}</div>}
      </div>

      <div style={abs({ left: 555, top: 222, width: 430, display: "flex", flexDirection: "column", gap: 9, color: "#fff" })}>
        {lineasFirma(persona, "jsc").map((l) => (
          <div key={l.icono} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 19 }}>
            <span style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <IconoLineaFirma icono={l.icono} color={naranja} size={21} />
            </span>
            <span style={{ whiteSpace: "nowrap" }}>{l.texto}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19 }}>
          {marca.redes.map((r) => (
            <IconoRed key={r} red={r} color="#fff" size={36} />
          ))}
          <span style={{ marginLeft: 10 }}>{marca.usuarioRedes}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kexford Company: white and teal, orange icon column.
function FirmaKexford({ fuentes, persona, conFoto, fondo, logoEmpresa, logoGrupo }: FirmaProps) {
  const foto = conFoto && persona.fotoUrl;
  const nombre = `${persona.nombre} ${persona.apellido}`.trim();
  const naranja = "#E8961E";
  const lineas = lineasFirma(persona, "kexford");
  const paso = lineas.length > 4 ? 60 : 72;
  const inicio = 208 + (312 - paso * lineas.length) / 2;

  return (
    <div
      className={fuentes.texto}
      style={{ width: FIRMA_ANCHO, height: FIRMA_ALTO, position: "relative", overflow: "hidden", background: "#fff" }}
    >
      {fondo ? (
        <Fondo src={fondo} />
      ) : (
        <>
          <div style={abs({ left: -120, top: -160, width: 240, height: 760, background: "rgba(242,140,40,0.09)", transform: "rotate(35deg)" })} />
          <div style={abs({ left: 150, top: 260, width: 220, height: 640, background: "rgba(18,181,176,0.09)", transform: "rotate(35deg)" })} />
          <div style={abs({ left: 490, top: 0, width: FIRMA_ANCHO - 490, height: FIRMA_ALTO, background: "#12B5B0" })} />
          <div style={abs({ left: 490, top: 208, width: FIRMA_ANCHO - 490, height: 312, background: "#2A9A9D" })} />
          {logoEmpresa && foto && (
            <img src={logoEmpresa} alt="" crossOrigin="anonymous" style={{ ...abs({ left: 140, top: 50, width: 200, height: 90, objectFit: "contain" }), ...MULTIPLICAR }} />
          )}
          <div style={abs({ left: 105, top: 488, display: "flex", alignItems: "center", gap: 12 })}>
            <span style={{ fontSize: 15, fontStyle: "italic", color: "#555" }}>Una marca del grupo</span>
            {logoGrupo && <img src={logoGrupo} alt="" crossOrigin="anonymous" style={{ height: 62, objectFit: "contain", ...MULTIPLICAR }} />}
          </div>
          <div style={abs({ left: 458, top: 198, width: 90, height: 328, borderRadius: 45, border: `2px solid ${naranja}` })} />
          <div style={abs({ left: 463, top: 203, width: 80, height: 318, borderRadius: 40, background: naranja })} />
        </>
      )}

      {foto ? (
        <Foto url={persona.fotoUrl!} left={105} top={172} size={260} />
      ) : (
        !fondo && logoEmpresa && (
          <img src={logoEmpresa} alt="" crossOrigin="anonymous" style={{ ...abs({ left: 90, top: 160, width: 300, height: 220, objectFit: "contain" }), ...MULTIPLICAR }} />
        )
      )}

      <div style={abs({ left: 557, top: 66, width: 430, color: "#fff" })}>
        <div style={{ fontSize: tamanoNombre(nombre, 44), fontWeight: 700, lineHeight: 1.12 }}>{nombre}</div>
        {persona.puesto && <div style={{ marginTop: 6, fontSize: 20, fontWeight: 600, color: "#F6E7B4" }}>{persona.puesto}</div>}
      </div>

      {lineas.map((l, i) => (
        <div key={l.icono} style={abs({ left: 482, top: inicio + i * paso + (paso - 42) / 2, height: 42, display: "flex", alignItems: "center", gap: 44, color: "#fff" })}>
          <span style={{ width: 42, height: 42, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <IconoLineaFirma icono={l.icono} color={naranja} size={24} />
          </span>
          <span style={{ fontSize: 20, whiteSpace: "nowrap" }}>{l.texto}</span>
        </div>
      ))}
    </div>
  );
}
