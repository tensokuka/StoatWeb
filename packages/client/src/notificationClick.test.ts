import { describe, expect, it, vi } from "vitest";

import {
  NOTIFICATION_OPEN_MESSAGE,
  openNotificationUrl,
  resolveNotificationTarget,
} from "./notificationClick";

const URL_ = "https://chat.example/channel/ABC";

function fakeClient(focused = false) {
  return {
    focused,
    focus: vi.fn().mockResolvedValue(undefined),
    postMessage: vi.fn(),
  };
}

function fakeClients(windows: ReturnType<typeof fakeClient>[]) {
  return {
    matchAll: vi.fn().mockResolvedValue(windows),
    openWindow: vi.fn().mockResolvedValue(null),
  } as unknown as Clients & { openWindow: ReturnType<typeof vi.fn> };
}

describe("openNotificationUrl", () => {
  it("reuses a running app instead of opening a window", async () => {
    const app = fakeClient();
    const clients = fakeClients([app]);

    await openNotificationUrl(clients, URL_);

    expect(app.focus).toHaveBeenCalled();
    expect(app.postMessage).toHaveBeenCalledWith({
      type: NOTIFICATION_OPEN_MESSAGE,
      url: URL_,
    });
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it("prefers the focused window", async () => {
    const background = fakeClient();
    const focused = fakeClient(true);

    await openNotificationUrl(fakeClients([background, focused]), URL_);

    expect(focused.postMessage).toHaveBeenCalled();
    expect(background.postMessage).not.toHaveBeenCalled();
  });

  it("opens a window when the app isn't running", async () => {
    const clients = fakeClients([]);

    await openNotificationUrl(clients, URL_);

    expect(clients.openWindow).toHaveBeenCalledWith(URL_);
  });

  it("opens a window when focusing is refused", async () => {
    const app = fakeClient();
    app.focus.mockRejectedValue(new Error("not allowed"));
    const clients = fakeClients([app]);

    await openNotificationUrl(clients, URL_);

    expect(app.postMessage).not.toHaveBeenCalled();
    expect(clients.openWindow).toHaveBeenCalledWith(URL_);
  });
});

describe("resolveNotificationTarget", () => {
  it("strips the instance prefix and trailing slash from push URLs", () => {
    expect(
      resolveNotificationTarget(
        "https://chat.example/i/api.example:443/server/S/channel/C/#uid=me",
        "me",
      ),
    ).toEqual({ path: "/server/S/channel/C" });
  });

  it("keeps plain paths from local notifications", () => {
    expect(resolveNotificationTarget(`${URL_}/M`, "me")).toEqual({
      path: "/channel/ABC/M",
    });
  });

  it("keeps the root path intact", () => {
    expect(resolveNotificationTarget("https://chat.example/", "me")).toEqual({
      path: "/",
    });
  });

  it("reloads when the notification is for another account", () => {
    const url = "https://chat.example/app#uid=other";
    expect(resolveNotificationTarget(url, "me")).toEqual({ reload: url });
  });
});
