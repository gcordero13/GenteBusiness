// Inline SVG icons for the email signatures, drawn in a single color so each
// design can tint them (white on dark, brand color on white circles).
import type { IconoLinea } from "./firmaDatos";

type Props = { color: string; size: number };

function Svg({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

function Whatsapp({ color, size }: Props) {
  return (
    <Svg size={size}>
      <path
        d="M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.3 21.7l5-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Z"
        fill={color}
      />
      <path
        d="M16.4 14.1c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.4a.9.9 0 0 0-.6.3 2.6 2.6 0 0 0-.8 1.9 4.5 4.5 0 0 0 1 2.4 10.2 10.2 0 0 0 3.9 3.4c1.5.6 2 .7 2.7.6a2.3 2.3 0 0 0 1.5-1.1 1.9 1.9 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3Z"
        fill={color}
      />
    </Svg>
  );
}

function Telefono({ color, size }: Props) {
  return (
    <Svg size={size}>
      <path
        d="M6.6 2.6c.5-.2 1.1 0 1.4.5l1.8 3.2c.3.5.2 1.1-.2 1.5L8.2 9.1a11.4 11.4 0 0 0 6.7 6.7l1.3-1.4c.4-.4 1-.5 1.5-.2l3.2 1.8c.5.3.7.9.5 1.4l-.8 2.2c-.3.8-1.1 1.3-2 1.2C10.4 20.2 3.8 13.6 3 5.4c-.1-.9.4-1.7 1.2-2Z"
        fill={color}
      />
    </Svg>
  );
}

function Celular({ color, size }: Props) {
  return (
    <Svg size={size}>
      <rect x="6.5" y="2" width="11" height="20" rx="2.5" fill="none" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="18" r="1.2" fill={color} />
    </Svg>
  );
}

function Correo({ color, size }: Props) {
  return (
    <Svg size={size}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" fill="none" stroke={color} strokeWidth="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </Svg>
  );
}

function Web({ color, size }: Props) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke={color} strokeWidth="1.8" />
      <ellipse cx="12" cy="12" rx="4.2" ry="9.5" fill="none" stroke={color} strokeWidth="1.8" />
      <path d="M2.8 9h18.4M2.8 15h18.4" stroke={color} strokeWidth="1.8" />
    </Svg>
  );
}

function Usuario({ color, size }: Props) {
  return (
    <Svg size={size}>
      <path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-5l-3 3-3-3H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill={color} />
      <circle cx="12" cy="8.5" r="2.6" fill="#fff" />
      <path d="M7.5 15.2a4.6 4.6 0 0 1 9 0" fill="#fff" />
    </Svg>
  );
}

export function IconoLineaFirma({ icono, color, size }: Props & { icono: IconoLinea }) {
  switch (icono) {
    case "whatsapp":
      return <Whatsapp color={color} size={size} />;
    case "celular":
      return <Celular color={color} size={size} />;
    case "telefono":
      return <Telefono color={color} size={size} />;
    case "correo":
      return <Correo color={color} size={size} />;
    case "web":
      return <Web color={color} size={size} />;
    case "usuario":
      return <Usuario color={color} size={size} />;
  }
}

export function IconoRed({ red, color, size }: Props & { red: "facebook" | "instagram" | "linkedin" }) {
  if (red === "facebook") {
    return (
      <Svg size={size}>
        <circle cx="12" cy="12" r="11" fill={color} />
        <path d="M13.3 20v-6.6h2.2l.4-2.6h-2.6V9.2c0-.8.3-1.3 1.3-1.3H16V5.6a17 17 0 0 0-2-.1c-2 0-3.3 1.2-3.3 3.4v1.9H8.5v2.6h2.2V20Z" fill="#000" fillOpacity="0.85" />
      </Svg>
    );
  }
  if (red === "instagram") {
    return (
      <Svg size={size}>
        <circle cx="12" cy="12" r="11" fill={color} />
        <rect x="6.5" y="6.5" width="11" height="11" rx="3.2" fill="none" stroke="#000" strokeOpacity="0.85" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="2.6" fill="none" stroke="#000" strokeOpacity="0.85" strokeWidth="1.7" />
        <circle cx="15.2" cy="8.8" r="0.9" fill="#000" fillOpacity="0.85" />
      </Svg>
    );
  }
  return (
    <Svg size={size}>
      <rect x="1" y="1" width="22" height="22" rx="3" fill={color} />
      <rect x="5.5" y="9.5" width="2.8" height="8.5" fill="#000" fillOpacity="0.85" />
      <circle cx="6.9" cy="6.6" r="1.6" fill="#000" fillOpacity="0.85" />
      <path d="M10.5 9.5h2.7v1.2c.4-.7 1.4-1.4 2.8-1.4 2.6 0 3.1 1.7 3.1 3.9V18h-2.8v-4.2c0-1-.1-2.3-1.4-2.3-1.4 0-1.6 1.1-1.6 2.2V18h-2.8Z" fill="#000" fillOpacity="0.85" />
    </Svg>
  );
}
