import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMailMock, createTransportMock, lookupMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({});
  const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock });
  const lookupMock = vi.fn().mockResolvedValue({ address: "40.100.1.1", family: 4 });
  return { sendMailMock, createTransportMock, lookupMock };
});

vi.mock("nodemailer", () => ({ default: { createTransport: createTransportMock } }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock, default: { lookup: lookupMock } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendGoservicesAssignedEmail,
  sendGoservicesNewRequestEmail,
  sendGoservicesStatusEmail,
} from "./sendGoservicesStatusEmail";

const VALID_SETTINGS = {
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_user: "user@example.com",
  smtp_pass: "secret",
  smtp_sender_name: "Gente Sánchez Business",
  smtp_admin_email: "notificaciones@sanchezbusinesscorp.com",
};

function mockAdmin() {
  const singleMock = vi.fn().mockResolvedValue({ data: VALID_SETTINGS, error: null });
  const eqMock = vi.fn().mockReturnValue({
    single: singleMock,
    maybeSingle: vi.fn().mockResolvedValue({ data: { logo_url: null }, error: null }),
  });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);
});

describe("sendGoservicesStatusEmail", () => {
  const baseInput = {
    requesterEmail: "empleado@sanchezbusinesscorp.com",
    requestNumber: 1119,
    requesterName: "Geronimo Cordero Bello",
    requestType: "mantenimiento" as const,
    typeLabel: "Mobiliario",
    subcategoria: "Compra",
    departmentName: "Tecnologia",
    createdAtIso: "2026-05-11T19:00:26Z",
    detalle: "Solicitud de compra de Gabetero 6 cajones",
    requestUrl: "https://gente-business.vercel.app/solicitudes/goservices",
  };

  it("sends a 'recibido' email with the SSGG team name, subcategoria and departamento lines", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, status: "recibido" });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const { to, subject, text, html } = sendMailMock.mock.calls[0][0];
    expect(to).toBe("empleado@sanchezbusinesscorp.com");
    expect(subject).toContain("Solicitud Recibida");
    expect(subject).toContain("1119");
    expect(text).not.toBe(html);

    for (const body of [text, html]) {
      expect(body).toContain("1119");
      expect(body).toContain("Geronimo Cordero Bello");
      expect(body).toContain("Mobiliario");
      expect(body).toContain("Compra");
      expect(body).toContain("Tecnologia");
      expect(body).toContain("Gabetero");
    }
    expect(html).toContain("Servicios Generales (SSGG)");
    expect(html).toContain("Solicitud Recibida");
  });

  it("uses the Mensajería team name in the 'recibido' closing paragraph for mensajeria requests", async () => {
    await sendGoservicesStatusEmail({
      ...baseInput,
      requestType: "mensajeria",
      subcategoria: null,
      status: "recibido",
    });

    const { html, text } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("El equipo de Mensajería");
    expect(html).not.toContain("Servicios Generales");
    expect(text).toContain("El equipo de Mensajería");
  });

  it("omits the Categoria line when subcategoria is null", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, subcategoria: null, status: "recibido" });

    const { html, text } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("Categoria");
    expect(text).not.toContain("Categoria");
  });

  it("omits the Departamento line when departmentName is null", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, departmentName: null, status: "recibido" });

    const { html, text } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("Departamento");
    expect(text).not.toContain("Departamento");
  });

  it("sends a 'completado' email with the completed title and closing text", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, status: "completado" });

    const { subject, html } = sendMailMock.mock.calls[0][0];
    expect(subject).toContain("Solicitud Completada");
    expect(html).toContain("Tu solicitud ha sido completada");
  });

  it("sends a 'cancelado' email with the cancelled title and closing text", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, status: "cancelado" });

    const { subject, html } = sendMailMock.mock.calls[0][0];
    expect(subject).toContain("Solicitud Cancelada");
    expect(html).toContain("Tu solicitud ha sido cancelada");
  });

  it("includes the Nota del ejecutor field in the 'completado' email when executorNote is set", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, status: "completado", executorNote: "Se reemplazó la pieza dañada" });

    const { html, text } = sendMailMock.mock.calls[0][0];
    expect(html).toContain("Nota del ejecutor");
    expect(html).toContain("Se reemplazó la pieza dañada");
    expect(text).toContain("Nota del ejecutor");
    expect(text).toContain("Se reemplazó la pieza dañada");
  });

  it("HTML-escapes the executorNote", async () => {
    await sendGoservicesStatusEmail({
      ...baseInput,
      status: "completado",
      executorNote: "<script>alert(1)</script>",
    });

    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("omits the Nota del ejecutor field when executorNote is absent", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, status: "completado" });

    const { html, text } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("Nota del ejecutor");
    expect(text).not.toContain("Nota del ejecutor");
  });

  it("omits the Nota del ejecutor field for non-completado statuses even if executorNote is set", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, status: "cancelado", executorNote: "Nota que no debería salir" });

    const { html, text } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("Nota del ejecutor");
    expect(text).not.toContain("Nota del ejecutor");
  });

  it("HTML-escapes free-text fields like detalle, requesterName and subcategoria", async () => {
    await sendGoservicesStatusEmail({
      ...baseInput,
      requesterName: "<b>Juan</b>",
      subcategoria: "<i>Urgente</i>",
      detalle: "<script>alert(1)</script>",
      status: "recibido",
    });

    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("<b>Juan</b>");
    expect(html).not.toContain("<i>Urgente</i>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;b&gt;Juan&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("formats the Fecha field as a readable Spanish date", async () => {
    await sendGoservicesStatusEmail({ ...baseInput, status: "recibido" });

    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).toContain(
      new Date(baseInput.createdAtIso).toLocaleDateString("es-DO", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    );
  });
});

describe("sendGoservicesNewRequestEmail", () => {
  const baseNewRequestInput = {
    requestNumber: 42,
    requesterName: "Juan Campos",
    typeLabel: "Cerrajería",
    subcategoria: "Cambio de chapa" as string | null,
    departmentName: "Operaciones" as string | null,
    createdAtIso: "2026-05-11T19:00:26Z",
    detalle: "Cambio de cerradura",
    manageUrl: "https://gente-business.vercel.app/goservices",
  };

  it("no-ops when managerEmails is empty", async () => {
    await sendGoservicesNewRequestEmail({ ...baseNewRequestInput, managerEmails: [] });

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("fans out to every manager email", async () => {
    await sendGoservicesNewRequestEmail({
      ...baseNewRequestInput,
      managerEmails: ["gestor1@sanchezbusinesscorp.com", "gestor2@sanchezbusinesscorp.com"],
    });

    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const recipients = sendMailMock.mock.calls.map((call) => call[0].to);
    expect(recipients).toEqual(["gestor1@sanchezbusinesscorp.com", "gestor2@sanchezbusinesscorp.com"]);
    const { subject, html } = sendMailMock.mock.calls[0][0];
    expect(subject).toContain("42");
    expect(html).toContain("Juan Campos");
    expect(html).toContain("Cerrajería");
    expect(html).toContain("Cambio de cerradura");
  });

  it("includes the rich field layout: N° de Solicitud, Categoria and Departamento", async () => {
    await sendGoservicesNewRequestEmail({
      ...baseNewRequestInput,
      managerEmails: ["gestor1@sanchezbusinesscorp.com"],
    });

    const { html, text } = sendMailMock.mock.calls[0][0];
    for (const body of [html, text]) {
      expect(body).toContain("42");
      expect(body).toContain("Cambio de chapa");
      expect(body).toContain("Operaciones");
      expect(body).toContain(
        new Date(baseNewRequestInput.createdAtIso).toLocaleDateString("es-DO", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      );
    }
  });

  it("omits Categoria and Departamento when not provided", async () => {
    await sendGoservicesNewRequestEmail({
      ...baseNewRequestInput,
      subcategoria: null,
      departmentName: null,
      managerEmails: ["gestor1@sanchezbusinesscorp.com"],
    });

    const { html, text } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("Categoria");
    expect(html).not.toContain("Departamento");
    expect(text).not.toContain("Categoria");
    expect(text).not.toContain("Departamento");
  });

  it("HTML-escapes requesterName and detalle", async () => {
    await sendGoservicesNewRequestEmail({
      ...baseNewRequestInput,
      requesterName: "<b>Juan</b>",
      detalle: "<script>alert(1)</script>",
      managerEmails: ["gestor1@sanchezbusinesscorp.com"],
    });

    const { html } = sendMailMock.mock.calls[0][0];
    expect(html).not.toContain("<b>Juan</b>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;b&gt;Juan&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("sendGoservicesAssignedEmail", () => {
  it("sends an assignment notification to the assignee", async () => {
    await sendGoservicesAssignedEmail({
      assigneeEmail: "ejecutor@sanchezbusinesscorp.com",
      requestNumber: 77,
      typeLabel: "Plomería",
      detalle: "Fuga de agua en el baño",
      assignedUrl: "https://gente-business.vercel.app/goservices/mis-tareas",
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const { to, subject, html } = sendMailMock.mock.calls[0][0];
    expect(to).toBe("ejecutor@sanchezbusinesscorp.com");
    expect(subject).toContain("77");
    expect(html).toContain("Plomería");
    expect(html).toContain("Fuga de agua en el baño");
  });
});
