import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { getScheduleTemplatesContext } from "./scheduleTemplates";
import { FALLBACK_SCHEDULE } from "./schedules";

function mockSupabase(data: unknown[] | null, error: { message: string } | null = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data, error }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getScheduleTemplatesContext", () => {
  it("maps multiple templates with days and picks the is_default template as the default", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase([
        {
          id: "template-a",
          name: "Morning shift",
          tolerance_minutes: 5,
          is_default: false,
          schedule_template_days: [
            { day_of_week: 1, start_time: "08:00:00", end_time: "16:00:00" },
            { day_of_week: 2, start_time: "08:00:00", end_time: "16:00:00" },
          ],
        },
        {
          id: "template-b",
          name: "Night shift",
          tolerance_minutes: 10,
          is_default: true,
          schedule_template_days: [
            { day_of_week: 1, start_time: "20:00:00", end_time: "04:00:00" },
          ],
        },
      ]) as never,
    );

    const result = await getScheduleTemplatesContext();

    expect(result.schedulesById.size).toBe(2);
    expect(result.schedulesById.get("template-a")).toEqual({
      id: "template-a",
      name: "Morning shift",
      tolerance_minutes: 5,
      days: [
        { day_of_week: 1, start_time: "08:00:00", end_time: "16:00:00" },
        { day_of_week: 2, start_time: "08:00:00", end_time: "16:00:00" },
      ],
    });
    expect(result.schedulesById.get("template-b")).toEqual({
      id: "template-b",
      name: "Night shift",
      tolerance_minutes: 10,
      days: [{ day_of_week: 1, start_time: "20:00:00", end_time: "04:00:00" }],
    });

    // is_default must not leak onto the returned ScheduleTemplate objects.
    expect(result.schedulesById.get("template-a")).not.toHaveProperty("is_default");
    expect(result.schedulesById.get("template-b")).not.toHaveProperty("is_default");

    expect(result.defaultSchedule).toEqual({
      id: "template-b",
      name: "Night shift",
      tolerance_minutes: 10,
      days: [{ day_of_week: 1, start_time: "20:00:00", end_time: "04:00:00" }],
    });
  });

  it("returns an empty map and the fallback schedule when data is an empty array", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase([]) as never);

    const result = await getScheduleTemplatesContext();

    expect(result.schedulesById.size).toBe(0);
    expect(result.defaultSchedule).toBe(FALLBACK_SCHEDULE);
  });

  it("returns an empty map and the fallback schedule when data is null", async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase(null) as never);

    const result = await getScheduleTemplatesContext();

    expect(result.schedulesById.size).toBe(0);
    expect(result.defaultSchedule).toBe(FALLBACK_SCHEDULE);
  });

  it("falls back to FALLBACK_SCHEDULE when templates exist but none is marked is_default", async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase([
        {
          id: "template-a",
          name: "Morning shift",
          tolerance_minutes: 5,
          is_default: false,
          schedule_template_days: [
            { day_of_week: 1, start_time: "08:00:00", end_time: "16:00:00" },
          ],
        },
      ]) as never,
    );

    const result = await getScheduleTemplatesContext();

    expect(result.schedulesById.size).toBe(1);
    expect(result.defaultSchedule).toBe(FALLBACK_SCHEDULE);
  });
});
