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

/**
 * Returns a safe, externally-linkable HTTP(S) URL or null.
 *
 * Carrier tracking links (`tracking_url`) are admin-configurable and point to
 * arbitrary third-party courier domains, so a host allowlist isn't viable.
 * Instead we guarantee the value is a well-formed absolute http(s) URL and
 * reject every dangerous scheme (`javascript:`, `data:`, `vbscript:`, `file:`,
 * etc.) so an abused row can never inject script or a deceptive non-web target
 * into an anchor's href. Returns null when the value is unsafe; callers should
 * hide the link when null.
 */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  // Reject control characters / whitespace smuggling.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
