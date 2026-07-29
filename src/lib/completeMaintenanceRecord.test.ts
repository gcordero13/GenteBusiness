import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/maintenancePdfReport", () => ({
  buildMaintenancePdfBytes: vi.fn(),
  formatDateForFilename: vi.fn().mockReturnValue("28-07-2026"),
}));
vi.mock("@/lib/sendMaintenanceEmail", () => ({
  sendMaintenanceReportEmail: vi.fn(),
  sendSurveyEmail: vi.fn(),
}));
vi.mock("@/lib/maintenanceToken", () => ({
  generateMaintenanceToken: vi.fn().mockReturnValue("survey-test-token"),
}));
vi.mock("@/lib/siteUrl", () => ({ getSiteUrl: vi.fn().mockResolvedValue("https://example.com") }));

import { createAdminClient } from "@/lib/supabase/admin";
import { buildMaintenancePdfBytes } from "@/lib/maintenancePdfReport";
import { sendMaintenanceReportEmail, sendSurveyEmail } from "@/lib/sendMaintenanceEmail";
import { completeMaintenanceRecord } from "./completeMaintenanceRecord";

const BASE_RECORD = {
  id: "record-1",
  created_by: "tech-1",
  first_name: "Ana",
  last_name: "García",
  position: "Analista",
  company_name: "Sanchez Business Corp",
  department_name: "TI",
  email: "ana@example.com",
  host_name: "DESKTOP-ANA",
  ram: "16 GB",
  os: "Windows 11",
  storage_total: "512 GB",
  storage_used: "200 GB",
  storage_free: "312 GB",
  findings: null,
  observations: null,
  technician_signature_path: "record-1/tecnico.png",
  user_signature_path: "record-1/usuario.png",
  restore_point_created: true,
  temp_files_cleaned: true,
  disk_defragmented: null,
  antivirus_updated: null,
  windows_updated: null,
  agenda_installed: null,
  apps_match_profile: null,
  wallpaper_installed: null,
  keyboard_cleaned: null,
  screen_cleaned: null,
};

function mockAdmin({
  downloadError = null,
  updateError = null,
  surveyInsertError = null,
}: { downloadError?: { message: string } | null; updateError?: { message: string } | null; surveyInsertError?: { message: string } | null } = {}) {
  const downloadMock = vi.fn().mockResolvedValue({
    data: downloadError ? null : new Blob([new Uint8Array([1, 2, 3])]),
    error: downloadError,
  });
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  const updateEqMock = vi.fn().mockResolvedValue({ error: updateError });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });
  const insertMock = vi.fn().mockResolvedValue({ error: surveyInsertError });

  return {
    storage: { from: vi.fn().mockReturnValue({ download: downloadMock, upload: uploadMock }) },
    from: vi.fn((table: string) => {
      if (table === "maintenance_records") return { update: updateMock };
      if (table === "maintenance_surveys") return { insert: insertMock };
      throw new Error(`unexpected table ${table}`);
    }),
    _mocks: { downloadMock, uploadMock, updateMock, updateEqMock, insertMock },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildMaintenancePdfBytes).mockResolvedValue(new Uint8Array([9, 9, 9]));
});

describe("completeMaintenanceRecord", () => {
  it("does not mark the record completed if PDF generation fails", async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdmin() as never);
    vi.mocked(buildMaintenancePdfBytes).mockRejectedValue(new Error("pdf boom"));

    await expect(completeMaintenanceRecord(BASE_RECORD as never)).rejects.toThrow("pdf boom");

    const admin = vi.mocked(createAdminClient).mock.results[0]!.value;
    expect(admin._mocks.updateMock).not.toHaveBeenCalled();
  });

  it("uploads the PDF, marks the record completed, creates the survey, and emails both", async () => {
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await completeMaintenanceRecord(BASE_RECORD as never);

    expect(admin._mocks.uploadMock).toHaveBeenCalledWith(
      "record-1.pdf",
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(admin._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completado", pdf_path: "record-1.pdf" }),
    );
    expect(admin._mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ maintenance_record_id: "record-1", technician_id: "tech-1", token: "survey-test-token" }),
    );
    expect(sendMaintenanceReportEmail).toHaveBeenCalled();
    expect(sendSurveyEmail).toHaveBeenCalledWith(
      expect.objectContaining({ surveyUrl: "https://example.com/encuesta/survey-test-token" }),
    );
  });

  it("still marks the record completed if sending email fails, recording the error instead", async () => {
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(sendMaintenanceReportEmail).mockRejectedValue(new Error("smtp down"));

    await completeMaintenanceRecord(BASE_RECORD as never);

    expect(admin._mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completado", email_error: "smtp down" }),
    );
  });
});
