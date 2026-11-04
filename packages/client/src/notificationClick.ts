/**
 * Message sent to a running app when one of its notifications is clicked
 */
export const NOTIFICATION_OPEN_MESSAGE = "notification-open";

/**
 * Where the app should go for a clicked notification
 */
export type NotificationTarget = { path: string } | { reload: string };

/**
 * Focus the running app and ask it to open a URL, or open a new window if there
 * isn't one. A worker can't navigate pages it doesn't control, and the push
 * workers have their own scope, so the page does its own navigation.
 * @param clients Service worker clients
 * @param url URL to open
 */
export async function openNotificationUrl(clients: Clients, url: string) {
  const windows = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  const client = windows.find((entry) => entry.focused) ?? windows[0];
  if (client) {
    try {
      await client.focus();
      client.postMessage({ type: NOTIFICATION_OPEN_MESSAGE, url });
      return;
    } catch {
      // Not allowed to focus it, so fall back to a new window
    }
  }

  await clients.openWindow(url);
}

/**
 * Work out how a running app should open a notification URL
 * @param url Notification URL
 * @param currentUserId Currently active user
 * @returns In-app path, or a URL to load if another account must be activated
 */
export function resolveNotificationTarget(
  url: string,
  currentUserId?: string,
): NotificationTarget {
  const { pathname, search, hash } = new URL(url);

  const userId = hash.startsWith("#uid=") ? hash.slice(5) : undefined;
  if (userId && userId !== currentUserId) return { reload: url };

  const path = pathname
    .replace(/^\/i\/[\w:.]+(?=\/)/, "")
    .replace(/(.)\/$/, "$1");
  return { path: path + search };
}
