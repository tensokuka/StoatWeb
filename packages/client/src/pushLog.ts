/**
 * A small log of what the push workers did, kept in Cache Storage so both the
 * workers and the settings page can read it. Phones give no other way to see
 * whether a push reached the worker without attaching a desktop debugger.
 */

const CACHE = "stoat-push-log";
const PREFIX = "/__push-log/";
const MAX_ENTRIES = 50;

export type PushLogKind = "received" | "shown" | "error" | "test";

export interface PushLogEntry {
  time: number;
  kind: PushLogKind;
  /** Scope of the worker or registration the entry is about */
  scope: string;
  detail?: string;
}

/**
 * Record an entry. Never throws, so logging can't stop a notification.
 */
export async function addPushLog(entry: PushLogEntry) {
  try {
    const cache = await caches.open(CACHE);
    const id = `${entry.time}-${Math.random().toString(36).slice(2, 8)}`;
    await cache.put(
      new Request(PREFIX + id),
      new Response(JSON.stringify(entry), {
        headers: { "Content-Type": "application/json" },
      }),
    );

    const keys = await cache.keys();
    if (keys.length > MAX_ENTRIES) {
      // Keys are named by time, so the oldest sort first
      const sorted = keys
        .map((request) => request.url)
        .sort((a, b) => entryTime(a) - entryTime(b));
      for (const url of sorted.slice(0, keys.length - MAX_ENTRIES)) {
        await cache.delete(url);
      }
    }
  } catch {
    // Cache Storage can be unavailable; the log is best effort
  }
}

/**
 * Entries newest first
 */
export async function readPushLog(): Promise<PushLogEntry[]> {
  try {
    const cache = await caches.open(CACHE);
    const entries: PushLogEntry[] = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (response) entries.push(await response.json());
    }
    return entries.sort((a, b) => b.time - a.time);
  } catch {
    return [];
  }
}

export async function clearPushLog() {
  try {
    await caches.delete(CACHE);
  } catch {
    // Nothing to clear
  }
}

function entryTime(url: string) {
  return Number(
    url.slice(url.lastIndexOf(PREFIX) + PREFIX.length).split("-")[0],
  );
}
