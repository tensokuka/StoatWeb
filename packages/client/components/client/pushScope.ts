/**
 * Path and query of a service worker scope, decoded so that browsers which
 * percent-encode the scope (e.g. `?@` as `?%40`) compare equal to the raw form
 */
export function normaliseScope(scope: string, origin: string): string {
  const url = new URL(scope, origin);
  const path = url.pathname + url.search;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Whether two service worker scopes refer to the same registration */
export function sameScope(a: string, b: string, origin: string): boolean {
  return normaliseScope(a, origin) === normaliseScope(b, origin);
}

/**
 * Scope of the push worker for one account: a path, never a query string,
 * since iOS drops the query from a scope (registering `/assets/?@id` gives
 * `/assets/`). Pushes then never reach the worker and iOS revokes the
 * subscription, and every account would share one worker.
 * @param workerUrl URL of the push worker script
 * @param userId Account the worker delivers pushes for
 */
export function pushScopeFor(workerUrl: string, userId: string): string {
  return `${pushScopeBase(workerUrl)}${userId}/`;
}

/** Directory holding every account's push worker scope */
export function pushScopeBase(workerUrl: string): string {
  return `${workerUrl.slice(0, workerUrl.lastIndexOf("/"))}/push/`;
}

/**
 * Account a push worker scope belongs to, or an empty string.
 * Also reads the old `?@id` form for workers registered before the change.
 */
export function userIdFromScope(scope: string): string {
  const url = new URL(scope, "https://scope.invalid");
  const fromPath = /\/push\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  if (fromPath) return decodeURIComponent(fromPath);
  const query = decodeURIComponent(url.search);
  return query.startsWith("?@") ? query.slice(2) : "";
}
