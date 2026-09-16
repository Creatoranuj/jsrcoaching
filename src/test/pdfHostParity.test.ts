/**
 * The client host list (src/lib/trustedPdfHosts.ts) and the edge function's
 * ALLOWED_HOSTS must stay identical. Deno cannot import from src/, so the
 * function keeps a literal copy — this test is what stops the two from
 * drifting apart again (which produced both "app says unreadable but the
 * proxy serves it" and "app says readable but the proxy 502s").
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TRUSTED_PDF_HOST_PATTERNS,
  isRelayableUrl,
  isTrustedPdfHost,
} from "@/lib/trustedPdfHosts";

function edgeAllowedHostSources(): string[] {
  const file = readFileSync(
    resolve(process.cwd(), "supabase/functions/pdf-proxy/index.ts"),
    "utf8",
  );
  const block = file.match(/const ALLOWED_HOSTS = \[([\s\S]*?)\n\];/);
  if (!block) throw new Error("ALLOWED_HOSTS block not found in pdf-proxy");
  return [...block[1].matchAll(/^\s*(\/.*\/[a-z]*),\s*$/gm)].map((m) => m[1]);
}

describe("pdf host allow-list parity", () => {
  const edge = edgeAllowedHostSources();
  const client = TRUSTED_PDF_HOST_PATTERNS.map((re) => re.toString());

  it("edge function exposes a parseable allow-list", () => {
    expect(edge.length).toBeGreaterThan(20);
  });

  it("every edge host is trusted by the client", () => {
    expect([...edge].sort()).toEqual([...client].sort());
  });

  for (const host of [
    "ncert.nic.in",
    "cbseacademic.nic.in",
    "cdn.jsdelivr.net",
    "raw.githubusercontent.com",
    "archive.org",
    "ia801604.us.archive.org",
    "notion.so",
    "file.notion.so",
    "prod-files-secure.s3.us-west-2.amazonaws.com",
    "cdn.statically.io",
    "assets.b-cdn.net",
    "dl.dropboxusercontent.com",
    "storage.googleapis.com",
    "wegamscqtvqhxowlskfm.supabase.co",
    "drive.google.com",
    "docs.google.com",
  ]) {
    it(`trusts ${host}`, () => expect(isTrustedPdfHost(host)).toBe(true));
  }

  for (const host of ["evil.example.com", "169.254.169.254", "localhost"]) {
    it(`does not trust ${host}`, () => expect(isTrustedPdfHost(host)).toBe(false));
  }

  it("only relays https", () => {
    expect(isRelayableUrl("https://ncert.nic.in/textbook/pdf/keph101.pdf")).toBe(true);
    expect(isRelayableUrl("http://ncert.nic.in/textbook/pdf/keph101.pdf")).toBe(false);
    expect(isRelayableUrl("not a url")).toBe(false);
  });
});
