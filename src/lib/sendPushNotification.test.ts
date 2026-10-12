import { beforeEach, describe, expect, it, vi } from "vitest";

const { setVapidDetailsMock, sendNotificationMock } = vi.hoisted(() => ({
  setVapidDetailsMock: vi.fn(),
  sendNotificationMock: vi.fn().mockResolvedValue({}),
}));

vi.mock("web-push", () => ({
  default: { setVapidDetails: setVapidDetailsMock, sendNotification: sendNotificationMock },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToAppUsers } from "./sendPushNotification";

const SUBSCRIPTIONS = [
  { id: "sub-1", endpoint: "https://push.example.com/1", p256dh: "p256dh-1", auth: "auth-1" },
  { id: "sub-2", endpoint: "https://push.example.com/2", p256dh: "p256dh-2", auth: "auth-2" },
];

function mockAdmin(subscriptions: typeof SUBSCRIPTIONS = SUBSCRIPTIONS) {
  const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
  const deleteMock = vi.fn().mockReturnValue({ eq: deleteEqMock });
  const inMock = vi.fn().mockResolvedValue({ data: subscriptions, error: null });
  const selectMock = vi.fn().mockReturnValue({ in: inMock });
  return { from: vi.fn().mockReturnValue({ select: selectMock, delete: deleteMock }), deleteEqMock };
}

const PAYLOAD = { title: "Título", body: "Cuerpo", url: "https://gente-business.vercel.app/goservices" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
  process.env.VAPID_PRIVATE_KEY = "private-key";
  process.env.VAPID_SUBJECT = "mailto:tecnologia@sanchezbusinesscorp.com";
});

describe("sendPushToAppUsers", () => {
  it("does nothing when there are no target app users", async () => {
    await sendPushToAppUsers([], PAYLOAD);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("returns silently without querying when VAPID keys are not configured", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await sendPushToAppUsers(["user-1"], PAYLOAD);

    expect(admin.from).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("sends a notification to every subscription on file for the given app users", async () => {
    const admin = mockAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await sendPushToAppUsers(["user-1", "user-2"], PAYLOAD);

    expect(setVapidDetailsMock).toHaveBeenCalledWith(
      "mailto:tecnologia@sanchezbusinesscorp.com",
      "public-key",
      "private-key",
    );
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: "https://push.example.com/1", keys: { p256dh: "p256dh-1", auth: "auth-1" } },
      JSON.stringify(PAYLOAD),
    );
  });

  it("prunes a subscription that the push service reports as gone (410), without throwing", async () => {
    const admin = mockAdmin([SUBSCRIPTIONS[0]]);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));

    await expect(sendPushToAppUsers(["user-1"], PAYLOAD)).resolves.toBeUndefined();

    expect(admin.from).toHaveBeenCalledWith("push_subscriptions");
    expect(admin.deleteEqMock).toHaveBeenCalledWith("id", "sub-1");
  });
});
