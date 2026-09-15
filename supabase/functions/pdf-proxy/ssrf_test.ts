// Unit tests for the SSRF guard in pdf-proxy.
// Ref: docs/AUDIT-2026-07-15.md — MEDIUM #10.
//
// Run with:
//   deno test supabase/functions/pdf-proxy/ssrf_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAllowedPdfUrl, rangeContainsPdfSignature } from "./index.ts";

const allow = (url: string) => assertEquals(isAllowedPdfUrl(url), true, url);
const deny = (url: string) => assertEquals(isAllowedPdfUrl(url), false, url);

Deno.test("SSRF: allow-listed CDNs pass", () => {
  allow("https://cdn.jsdelivr.net/gh/foo/bar@main/x.pdf");
  allow("https://raw.githubusercontent.com/foo/bar/main/x.pdf");
  allow("https://acct.blob.core.windows.net/c/x.pdf");
  allow("https://github-storages-cdn.vercel.app/x.pdf");
  allow("https://storage-naveenbharat-recording.vercel.app/view/abc");
});

Deno.test("Google Docs: only export paths are allowed", () => {
  allow("https://docs.google.com/document/d/ABC_123-x/export?format=pdf");
  allow("https://docs.google.com/spreadsheets/d/ABC_123-x/export?format=pdf");
  allow("https://doc-0s-4c-docs.googleusercontent.com/docs/securesc/x/y.pdf");
  deny("https://docs.google.com/document/d/ABC_123-x/edit");
  deny("https://docs.google.com/anything-else");
  deny("https://docs.google.com.evil.tld/document/d/x/export");
});

Deno.test("SSRF: metadata endpoint is denied", () => {
  deny("http://169.254.169.254/latest/meta-data/");
  deny("https://169.254.169.254/latest/meta-data/");
  deny("http://169.254.169.254.nip.io/"); // still not allow-listed
});

Deno.test("SSRF: private / loopback / link-local are denied", () => {
  deny("https://localhost/x.pdf");
  deny("https://127.0.0.1/x.pdf");
  deny("https://10.0.0.5/x.pdf");
  deny("https://192.168.1.1/x.pdf");
  deny("https://172.16.0.1/x.pdf");
  deny("https://172.31.255.255/x.pdf");
});

Deno.test("SSRF: non-https schemes are denied", () => {
  deny("http://cdn.jsdelivr.net/x.pdf");
  deny("file:///etc/passwd");
  deny("gopher://cdn.jsdelivr.net/x.pdf");
});

Deno.test("SSRF: credentials, ports, IP literals are denied", () => {
  deny("https://user:pass@cdn.jsdelivr.net/x.pdf");
  deny("https://cdn.jsdelivr.net:8080/x.pdf");
  deny("https://[::1]/x.pdf");
});

Deno.test("SSRF: arbitrary hosts outside allow-list are denied", () => {
  deny("https://evil.example.com/x.pdf");
  deny("https://attacker.tld/cdn.jsdelivr.net/x.pdf");
  deny("https://cdn.jsdelivr.net.evil.tld/x.pdf");
});

Deno.test("SSRF: garbage input is denied without throwing", () => {
  deny("");
  deny("not-a-url");
  deny("//cdn.jsdelivr.net/x.pdf");
});

Deno.test("PDF validation: tiny Range probes are not treated as invalid PDFs", () => {
  assertEquals(rangeContainsPdfSignature(null), true);
  assertEquals(rangeContainsPdfSignature("bytes=0-0"), false);
  assertEquals(rangeContainsPdfSignature("bytes=0-3"), false);
  assertEquals(rangeContainsPdfSignature("bytes=0-4"), true);
  assertEquals(rangeContainsPdfSignature("bytes=0-524287"), true);
  assertEquals(rangeContainsPdfSignature("bytes=524288-1048575"), false);
});
