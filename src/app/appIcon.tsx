import { getPlatformLogoUrl } from "@/lib/platformSettings";

// Shared by icon.tsx and apple-icon.tsx. The uploaded platform logo is
// white-on-transparent, so it's unreadable placed directly on a light home
// screen background — this always composites it onto the app's solid teal
// accent color first, the same way the plain "GSB" fallback mark already
// does, so the icon is visible regardless of what logo is uploaded.
export async function buildAppIconElement(size: number) {
  const logoUrl = await getPlatformLogoUrl();
  const radius = Math.round(size * 0.1875); // matches icon.svg's rx="96" on a 512 canvas

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#04B1AF",
        borderRadius: radius,
      }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          width={Math.round(size * 0.66)}
          height={Math.round(size * 0.66)}
          style={{ objectFit: "contain" }}
          alt=""
        />
      ) : (
        <span
          style={{
            color: "#FFFFFF",
            fontSize: Math.round(size * 0.371),
            fontWeight: 700,
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        >
          GSB
        </span>
      )}
    </div>
  );
}
