import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { submitSurveyResponse } from "./actions";

function mockAdmin({ record = null, updateError = null }: { record?: Record<string, unknown> | null; updateError?: { message: string } | null } = {}) {
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: record, error: record ? null : { message: "not found" } });
  const eqSelectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqSelectMock });
  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock, update: updateMock }), _mocks: { updateMock, updateEqMock } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitSurveyResponse", () => {
  it("rejects an unknown token", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);

    const result = await submitSurveyResponse("bad-token", {
      quality_score: 5,
      professionalism_score: 5,
      clarity_score: 5,
      satisfaction_score: 5,
      comments: "",
    });

    expect(result.error).toBe("Enlace inválido o expirado");
  });

  it("rejects a survey that was already answered", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin({ record: { id: "s1", status: "respondida" } }) as never);

    const result = await submitSurveyResponse("token-1", {
      quality_score: 5,
      professionalism_score: 5,
      clarity_score: 5,
      satisfaction_score: 5,
      comments: "",
    });

    expect(result.error).toBe("Esta encuesta ya fue respondida");
  });

  it("saves the responses and marks the survey as respondida", async () => {
    const admin = mockAdmin({ record: { id: "s1", status: "pendiente" } });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const result = await submitSurveyResponse("token-1", {
      quality_score: 5,
      professionalism_score: 5,
      clarity_score: 4,
      satisfaction_score: 5,
      comments: "Muy buen servicio",
    });

    expect(result.error).toBeUndefined();
    expect(admin._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "respondida",
        quality_score: 5,
        professionalism_score: 5,
        clarity_score: 4,
        satisfaction_score: 5,
        comments: "Muy buen servicio",
      }),
    );
  });
});
