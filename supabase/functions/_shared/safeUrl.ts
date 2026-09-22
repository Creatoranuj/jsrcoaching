// Audit 2026-09-22 — shared "is this a public web URL" gate for any function
// that hands a caller-supplied URL to a fetcher (ours or a third party such as
// Firecrawl). The previous inline regex only matched dotted-decimal private
// ranges, so `http://2130706433/`, `http://0x7f000001/`, `http://[::ffff:127.0.0.1]/`,
// `http://user:pw@host/`, `*.localhost` and `*.internal` slipped through.

const PRIVATE_HOST_SUFFIXES = [".localhost", ".internal", ".local", ".home.arpa"];
const PRIVATE_HOSTNAMES = new Set(["localhost", "metadata", "metadata.google.internal", "0.0.0.0"]);

/** Parse any IPv4 literal form (dotted, shorthand, decimal, hex, octal) to a 32-bit int. */
function parseIPv4(host: string): number | null {
  if (!/^[0-9a-fx.]+$/i.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p === "") return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^\d+$/.test(p)) n = parseInt(p, 10);
    else return null;
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  // Last part carries the remaining bytes (e.g. 127.1 == 127.0.0.1).
  const last = nums.pop()!;
  const maxLast = 2 ** (8 * (4 - nums.length));
  if (last >= maxLast || nums.some((n) => n > 255)) return null;
  let value = 0;
  for (const n of nums) value = value * 256 + n;
  value = value * maxLast + last;
  return value >>> 0;
}

function isPrivateIPv4(ip: number): boolean {
  const a = ip >>> 24;
  const b = (ip >>> 16) & 255;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10/8
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local + cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 168) || // 192.168/16
    (a === 192 && b === 0) || // 192.0.0/24, 192.0.2/24 test nets
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast + reserved + broadcast
  );
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // fe80::/10
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h) ?? /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mapped) {
    const v4 = mapped[2]
      ? parseIPv4(
          `${parseInt(mapped[1], 16) >>> 8}.${parseInt(mapped[1], 16) & 255}.${parseInt(mapped[2], 16) >>> 8}.${parseInt(mapped[2], 16) & 255}`,
        )
      : parseIPv4(mapped[1]);
    return v4 === null ? true : isPrivateIPv4(v4);
  }
  return false;
}

export interface UrlCheck {
  ok: boolean;
  reason?: string;
  url?: URL;
}

/**
 * Accepts only http(s) URLs that point at a public host. Rejects credentials
 * in the URL, loopback / private / link-local / metadata addresses in every
 * numeric encoding, and well-known internal hostnames.
 */
export function validatePublicUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: "Invalid URL format" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only http(s) URLs are allowed" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Credentials in URLs are not allowed" };
  }
  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "Missing host" };
  if (PRIVATE_HOSTNAMES.has(host) || PRIVATE_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Internal hosts are not allowed" };
  }
  if (host.startsWith("[") || host.includes(":")) {
    if (isPrivateIPv6(host)) return { ok: false, reason: "Private address" };
    return { ok: true, url };
  }
  const v4 = parseIPv4(host);
  if (v4 !== null && isPrivateIPv4(v4)) return { ok: false, reason: "Private address" };
  return { ok: true, url };
}
