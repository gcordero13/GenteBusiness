import "server-only";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BrandedEmailInput {
  title: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  logoUrl?: string | null;
  footerText?: string;
}

export function buildBrandedEmailHtml(input: BrandedEmailInput): string {
  const footerText =
    input.footerText ??
    "Correo generado automáticamente por el sistema de mantenimiento de Gente Sánchez Business.";
  const logoBlock = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="Gente Sánchez Business" width="44" height="44" style="border-radius:10px;display:block;margin:0 auto 10px;" />`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#04B1AF;padding:28px 24px;text-align:center;">
                ${logoBlock}
                <div style="color:#ffffff;font-size:16px;font-weight:bold;">Gente Sánchez Business</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;color:#27272a;font-size:15px;line-height:1.6;">
                <h1 style="font-size:19px;margin:0 0 16px;color:#18181b;">${escapeHtml(input.title)}</h1>
                ${input.bodyHtml}
                <div style="text-align:center;margin:30px 0 6px;">
                  <a href="${escapeHtml(input.ctaUrl)}" style="background:#04B1AF;color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block;">${escapeHtml(input.ctaText)}</a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;text-align:center;">
                ${escapeHtml(footerText)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
