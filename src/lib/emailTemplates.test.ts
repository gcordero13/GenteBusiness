import { describe, expect, it } from "vitest";
import { buildBrandedEmailHtml } from "./emailTemplates";

describe("buildBrandedEmailHtml", () => {
  it("includes the title, body, CTA button, and URL", () => {
    const html = buildBrandedEmailHtml({
      title: "Hola, Ana",
      bodyHtml: "<p>Cuerpo del mensaje</p>",
      ctaText: "Completar formulario",
      ctaUrl: "https://example.com/mantenimiento/abc123",
      logoUrl: null,
    });

    expect(html).toContain("Hola, Ana");
    expect(html).toContain("Cuerpo del mensaje");
    expect(html).toContain("Completar formulario");
    expect(html).toContain("https://example.com/mantenimiento/abc123");
    expect(html).not.toContain("<img");
  });

  it("renders the logo image when a logoUrl is provided", () => {
    const html = buildBrandedEmailHtml({
      title: "Hola",
      bodyHtml: "<p>x</p>",
      ctaText: "Ir",
      ctaUrl: "https://example.com",
      logoUrl: "https://cdn.example.com/logo.png",
    });

    expect(html).toContain('<img src="https://cdn.example.com/logo.png"');
  });

  it("escapes HTML special characters in the title and CTA text", () => {
    const html = buildBrandedEmailHtml({
      title: '<script>alert("x")</script>',
      bodyHtml: "<p>x</p>",
      ctaText: "Click & <win>",
      ctaUrl: "https://example.com",
      logoUrl: null,
    });

    expect(html).not.toContain("<script>alert(\"x\")</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Click &amp; &lt;win&gt;");
  });

  it("uses a custom footerText when provided, instead of the maintenance-system default", () => {
    const html = buildBrandedEmailHtml({
      title: "Hola",
      bodyHtml: "<p>x</p>",
      ctaText: "Ir",
      ctaUrl: "https://example.com",
      logoUrl: null,
      footerText: "Correo generado automáticamente por Gente Sánchez Business.",
    });

    expect(html).toContain("Correo generado automáticamente por Gente Sánchez Business.");
    expect(html).not.toContain("sistema de mantenimiento");
  });
});
