/**
 * Percent-decode a filename/title once. Falls back to the raw string on
 * `URIError` (malformed sequences) so we never crash on user-generated names.
 */
export function safeDecodeFileName(name: string | null | undefined): string {
  if (!name) return "";
  try {
    // Only decode if it actually contains percent-encoded bytes.
    if (!/%[0-9A-Fa-f]{2}/.test(name)) return name;
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
