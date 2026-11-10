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
