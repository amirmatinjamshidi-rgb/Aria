/**
 * SSRF guards for fetch_page: only public http(s) URLs.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

export function assertSafePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost")) {
    throw new Error("Refusing to fetch local or metadata hosts");
  }

  if (isPrivateOrReservedHost(host)) {
    throw new Error("Refusing to fetch private or reserved network addresses");
  }

  return url;
}

function isPrivateOrReservedHost(host: string): boolean {
  if (host === "::1" || host === "0.0.0.0") {
    return true;
  }

  // IPv6 unique-local / link-local (simplified)
  if (host.includes(":")) {
    const normalized = host.toLowerCase();
    if (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    ) {
      return true;
    }
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }

  const parts = ipv4.slice(1).map(Number);
  if (parts.some((n) => n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}
