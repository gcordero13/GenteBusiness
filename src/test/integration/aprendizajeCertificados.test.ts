import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAprendizajeTestUser, deleteAprendizajeTestUser } from "./aprendizajeTestHelpers";
import type { TestUser } from "./supabaseTestHelpers";

describe("aprendizaje certificates", () => {
  let manager: TestUser;
  let learner: TestUser;
  let other: TestUser;
  let cursoId: string;
  let leccionIds: string[];

  beforeAll(async () => {
    manager = await createAprendizajeTestUser({ canView: true, canManage: true });
    learner = await createAprendizajeTestUser({ canView: true, canManage: false });
    other = await createAprendizajeTestUser({ canView: true, canManage: false });
    const { data: curso, error } = await manager.client
      .from("aprendizaje_cursos")
      .insert({
        title: "Certificado (test)",
        category: "curso",
        created_by: manager.id,
        status: "publicado",
        firma_nombre: "Firmante Test",
        firma_cargo: "Gerente de Gestión Humana",
      })
      .select("id")
      .single();
    if (error || !curso) throw new Error(`insert curso: ${error?.message}`);
    cursoId = curso.id;
    const { data: lecciones, error: lError } = await manager.client
      .from("aprendizaje_lecciones")
      .insert([
        { curso_id: cursoId, position: 0, title: "Uno" },
        { curso_id: cursoId, position: 1, title: "Dos" },
      ])
      .select("id, position");
    if (lError || !lecciones) throw new Error(`insert lecciones: ${lError?.message}`);
    leccionIds = [...lecciones].sort((a, b) => a.position - b.position).map((l) => l.id as string);
  }, 90_000);

  afterAll(async () => {
    if (cursoId) await createAdminClient().from("aprendizaje_cursos").delete().eq("id", cursoId);
    for (const u of [manager, learner, other]) await deleteAprendizajeTestUser(u);
  }, 90_000);

  async function miCertificado(user: TestUser) {
    const { data, error } = await user.client.rpc("aprendizaje_mi_certificado", { p_curso_id: cursoId });
    if (error) throw new Error(error.message);
    return (data ?? []) as { codigo: string; nombre: string; curso_title: string; firma_cargo: string | null }[];
  }

  it("has no certificate until the course is completed", async () => {
    const { error } = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[0] });
    expect(error).toBeNull();
    expect(await miCertificado(learner)).toEqual([]);
  });

  it("gives the owner their certificate once completed, and nobody else", async () => {
    const { error } = await learner.client.rpc("aprendizaje_marcar_leccion", { p_leccion_id: leccionIds[1] });
    expect(error).toBeNull();
    const [cert] = await miCertificado(learner);
    expect(cert).toMatchObject({ curso_title: "Certificado (test)", firma_cargo: "Gerente de Gestión Humana" });
    expect(cert.codigo).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(await miCertificado(other)).toEqual([]);
  });

  it("verifies the code publicly, without a session", async () => {
    const [cert] = await miCertificado(learner);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.rpc("aprendizaje_verificar_certificado", {
      p_codigo: ` ${cert.codigo.toLowerCase()} `,
    });
    expect(error).toBeNull();
    expect(data).toEqual([{ nombre: cert.nombre, curso_title: "Certificado (test)", completed_at: expect.any(String) }]);
    const { data: none } = await anon.rpc("aprendizaje_verificar_certificado", { p_codigo: "0000-0000-0000" });
    expect(none).toEqual([]);
  });

  it("doesn't let anonymous callers read someone's certificate", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await anon.rpc("aprendizaje_mi_certificado", { p_curso_id: cursoId });
    expect(error).not.toBeNull();
  });

  // User report: the certificate printed the email because app_users.full_name is
  // usually empty. The name comes from the person's Agenda contact, like the portal.
  it("prints the name from the person's Agenda contact, not the email", async () => {
    const admin = createAdminClient();
    const { data: contact, error } = await admin
      .from("contacts")
      .insert({ first_name: "Participante", last_name: "De Prueba", email: learner.email.toUpperCase() })
      .select("id")
      .single();
    if (error || !contact) throw new Error(`insert contact: ${error?.message}`);
    try {
      const [cert] = await miCertificado(learner);
      expect(cert.nombre).toBe("Participante De Prueba");
      const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      });
      const { data } = await anon.rpc("aprendizaje_verificar_certificado", { p_codigo: cert.codigo });
      expect(data?.[0]?.nombre).toBe("Participante De Prueba");
    } finally {
      await admin.from("contacts").delete().eq("id", contact.id);
    }
  });

  it("only managers can set the course signature", async () => {
    const { data } = await learner.client
      .from("aprendizaje_cursos")
      .update({ firma_nombre: "X" })
      .eq("id", cursoId)
      .select("id");
    expect(data ?? []).toEqual([]);
  });
});
