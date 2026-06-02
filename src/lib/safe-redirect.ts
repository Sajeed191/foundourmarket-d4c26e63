/**
 * Returns a safe internal path or null. Blocks open-redirect vectors:
 * - absolute URLs (https://evil.com)
 * - protocol-relative URLs (//evil.com, /\evil.com)
 * - control/whitespace tricks
 * Only same-origin paths beginning with a single "/" are allowed.
 */
export function safeInternalPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  // Must be an absolute path within this site.
  if (!value.startsWith("/")) return null;
  // Reject protocol-relative ("//host") and backslash variants ("/\host").
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  // Reject any scheme/host smuggling or whitespace.
  if (/[\x00-\x1f]/.test(value)) return null;
  if (/^\/[^/]*:/.test(value)) return null; // e.g. "/javascript:" style
  return value;
}
