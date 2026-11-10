/// <reference lib="webworker" />
import { userIdFromScope } from "../components/client/pushScope";
import { openNotificationUrl } from "./notificationClick";
import { addPushLog } from "./pushLog";

declare let self: ServiceWorkerGlobalScope;

interface ChannelPartial {
  channel_type: string;
  name?: string;
}

interface StoatPushNotification {
  title?: string;
  author?: string;
  body: string;
  icon?: string;
  channel?: ChannelPartial;
  url?: string;
}

const scope = new URL(self.registration.scope),
  root = scope.origin,
  userId = userIdFromScope(self.registration.scope);

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (typeof event.notification.data === "string") {
    event.waitUntil(openNotificationUrl(self.clients, event.notification.data));
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

/**
 * Always show something: iOS revokes the subscription of a worker that
 * receives pushes without showing a notification, and a failure here would
 * otherwise be invisible.
 */
async function handlePush(event: PushEvent) {
  const scope = self.registration.scope;
  const text = event.data?.text();

  await addPushLog({
    time: Date.now(),
    kind: "received",
    scope,
    detail: text === undefined ? "no data" : `${text.length} characters`,
  });

  let title = "Stoat";
  let options: NotificationOptions = {
    body: "New message",
    data: `${root}/app#uid=${userId}`,
  };

  try {
    if (text === undefined) throw new Error("push had no data");
    const notif: StoatPushNotification = JSON.parse(text);

    title =
      notif.title ||
      (notif.channel
        ? notif.channel.channel_type === "DirectMessage"
          ? notif.author || "Stoat"
          : `${notif.author} in ${notif.channel.name}`
        : "Stoat");

    //Redirect instance URL
    const url = notif.url && new URL(notif.url);
    options = {
      icon: notif.icon,
      body: notif.body,
      data: `${root}${url ? `/i/${url.host}${url.pathname}/` : "/app"}#uid=${userId}`,
    };
  } catch (e) {
    await addPushLog({
      time: Date.now(),
      kind: "error",
      scope,
      detail: `reading the push failed, showing a generic one: ${e}`,
    });
  }

  try {
    await self.registration.showNotification(title, options);
    await addPushLog({ time: Date.now(), kind: "shown", scope, detail: title });
  } catch (e) {
    await addPushLog({
      time: Date.now(),
      kind: "error",
      scope,
      detail: `showNotification failed: ${e}`,
    });
  }
}
