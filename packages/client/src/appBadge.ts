/**
 * The unread count on the app icon. The app sets the real number while it's
 * open; the push worker, which can't see unreads, adds one per push from the
 * last number the app saved. Kept in Cache Storage so both can reach it.
 */

const CACHE = "stoat-push-log";
const KEY = "/__app-badge";

type BadgeNavigator = Navigator & {
  setAppBadge?(count?: number): Promise<void>;
  clearAppBadge?(): Promise<void>;
};

async function save(count: number) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(new Request(KEY), new Response(String(count)));
  } catch {
    // best effort
  }
}

async function load() {
  try {
    const cache = await caches.open(CACHE);
    const response = await cache.match(KEY);
    return response ? Number(await response.text()) || 0 : 0;
  } catch {
    return 0;
  }
}

/** The last error from setting the badge, for diagnostics */
export let lastAppBadgeError: string | undefined;

async function show(count: number) {
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
    lastAppBadgeError = undefined;
  } catch (e) {
    // not supported, or not allowed without notification permission
    lastAppBadgeError = String(e);
  }
}

/** Whether this browser can badge the app icon */
export function appBadgeSupported() {
  return "setAppBadge" in navigator;
}

/** The last count saved, for diagnostics */
export const savedAppBadge = load;

/** Set the badge to the real count (from the app) */
export async function setAppBadge(count: number) {
  await save(count);
  await show(count);
}

/** One more unread (from the push worker) */
export async function bumpAppBadge() {
  const count = (await load()) + 1;
  await save(count);
  await show(count);
}
