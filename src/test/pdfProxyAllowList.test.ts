/**
 * Guard: the pdf-proxy allow-list must keep covering the official study
 * sources students paste (NCERT/CBSE, Notion files, common CDNs) and must
 * consult the admin-managed `trusted_hosts` table at runtime, so an admin can
 * unblock a new host without a redeploy. A regression here shows up in the app
 * as "Failed to fetch" when opening a perfectly valid PDF link.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(__dirname, "../../supabase/functions/pdf-proxy/index.ts"),
  "utf8",
);

const REQUIRED_HOSTS = [
  "ncert\\.nic\\.in",
  "ncertbooks\\.nic\\.in",
  "epathshala\\.nic\\.in",
  "cbseacademic\\.nic\\.in",
  "cbse\\.gov\\.in",
  "notion\\.so",
  "notion\\.site",
  "notion-static\\.com",
  "prod-files-secure",
  "unpkg\\.com",
  "cloudfront\\.net",
  "githubusercontent\\.com",
  "dropboxusercontent\\.com",
  "supabase\\.co",
];

describe("pdf-proxy allow-list", () => {
  for (const host of REQUIRED_HOSTS) {
    it(`allows ${host.replace(/\\\./g, ".")}`, () => {
      expect(source).toContain(host);
    });
  }

  it("keeps the SSRF guards factored out and applied", () => {
    expect(source).toContain("export function passesSsrfGuards(u: URL)");
    expect(source).toContain("169.254.");
    // isAllowedPdfUrl still runs the guards before matching hosts.
    expect(source).toMatch(/export function isAllowedPdfUrl[\s\S]{0,200}passesSsrfGuards\(u\)/);
  });

  it("consults admin-managed trusted_hosts at runtime", () => {
    expect(source).toContain('.from("trusted_hosts")');
    expect(source).toContain("export async function isAllowedPdfUrlAsync");
    expect(source).toContain("matchesTrustedHost");
  });

  it("uses the async check on the request and redirect paths", () => {
    const asyncChecks = source.match(/await isAllowedPdfUrlAsync\(/g) ?? [];
    expect(asyncChecks.length).toBeGreaterThanOrEqual(2);
  });
});
