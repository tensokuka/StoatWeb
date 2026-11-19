/**
 * Text shared into the app from another app (Android share sheet), from the
 * share_target query parameters. Repeats are dropped: many apps put the link
 * in both `text` and `url`.
 */
export function sharedText(params: URLSearchParams) {
  const parts: string[] = [];
  for (const key of ["title", "text", "url"]) {
    const value = params.get(key)?.trim();
    if (value && !parts.some((part) => part.includes(value))) {
      parts.push(value);
    }
  }
  return parts.join("\n");
}
