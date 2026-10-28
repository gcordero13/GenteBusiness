import "server-only";

// A dedicated, more elaborate template for task assignment/completion
// emails only (matches a design mockup the user supplied) - deliberately
// NOT a change to buildBrandedEmailHtml in emailTemplates.ts, which stays
// exactly as-is for every other module's emails (vacaciones, maintenance,
// complaints, etc.) that weren't part of this request.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface TareaNotificationMetaItem {
  icon: string;
  label: string;
  value: string;
}

export interface TareaNotificationEmailInput {
  badgeText: string;
  headline: string;
  bodyHtml: string;
  meta: TareaNotificationMetaItem[];
  ctaText: string;
  ctaUrl: string;
  logoUrl?: string | null;
}

// Table-based layout and inline styles throughout - this has to render
// reasonably in Outlook's Word-based engine, not just modern webmail, so
// no flexbox/grid and no external stylesheet.
export function buildTareaNotificationEmailHtml(input: TareaNotificationEmailInput): string {
  const logoImg = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="" width="32" height="32" style="border-radius:8px;vertical-align:middle;display:inline-block;margin-right:10px;" />`
    : "";

  const metaCells = input.meta
    .map(
      (m) => `
        <td style="padding:0 28px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:34px;height:34px;border-radius:999px;background:#e8edfb;text-align:center;vertical-align:middle;font-size:16px;line-height:34px;">${m.icon}</td>
            <td style="padding-left:10px;vertical-align:middle;">
              <div style="font-size:11px;color:#8a94ab;line-height:1.4;">${escapeHtml(m.label)}</div>
              <div style="font-size:13px;font-weight:700;color:#0b1734;line-height:1.4;">${escapeHtml(m.value)}</div>
            </td>
          </tr></table>
        </td>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:#0b2447;padding:26px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="vertical-align:middle;">
                    ${logoImg}<span style="color:#ffffff;font-size:17px;font-weight:700;vertical-align:middle;">Gente Sánchez <span style="font-weight:400;opacity:0.85;">Business</span></span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;border-left:1px solid rgba(255,255,255,0.25);padding-left:16px;color:rgba(255,255,255,0.65);font-size:10px;letter-spacing:0.04em;line-height:1.5;">JUNTOS HACEMOS<br />QUE LAS COSAS PASEN</span>
                  </td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <span style="display:inline-block;background:#e8f0fe;color:#1a56db;font-size:12px;font-weight:700;padding:6px 14px;border-radius:999px;">
                  ✓ ${escapeHtml(input.badgeText)}
                </span>
                <h1 style="margin:16px 0 12px;font-size:26px;line-height:1.25;color:#0b1734;">${escapeHtml(input.headline)}</h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#44506b;">${input.bodyHtml}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;"><tr>${metaCells}</tr></table>
                <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#1a56db;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">
                  ${escapeHtml(input.ctaText)} &rarr;
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;border-top:1px solid #eef1f6;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td style="font-size:12px;color:#0b1734;font-weight:700;">Gente Sánchez Business</td>
                  <td align="right" style="font-size:11px;color:#8a94ab;">Correo generado automáticamente por Gente Sánchez Business.</td>
                </tr></table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
