// URL sanitization for untrusted input. OSM tag values (website,
// contact:website, …) are third-party data anyone can edit — they must never
// reach an href unless they're plain web URLs.

// Returns the URL if it parses and uses http(s); otherwise undefined.
// Scheme-less values like "example.com/menu" are common in OSM and get https.
export function safeUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    /* unparseable */
  }
  return undefined;
}
