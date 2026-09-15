import { describe, it, expect } from "vitest";
import { friendlyPdfErrorMessage, DRIVE_PRIVATE_MSG } from "../lib/pdfErrorMessage";

const cdn = "https://cdn.example.com/files/tense-01.pdf";
const drive = "https://drive.google.com/uc?id=abc";
const proxy = "https://x.functions.supabase.co/pdf-proxy?kind=drive&id=abc";

describe("friendlyPdfErrorMessage — CDN sources show the exact reason", () => {
  it("403 on a CDN link names status, host and server text — never Drive wording", () => {
    const msg = friendlyPdfErrorMessage(
      { message: "HTTP 403", status: 403, statusText: "Forbidden" },
      cdn
    );
    expect(msg).toContain("403");
    expect(msg).toContain("cdn.example.com");
    expect(msg).toContain("Forbidden");
    expect(msg).not.toContain("Drive");
  });

  it("404 on a CDN link says the file is missing at its link", () => {
    const msg = friendlyPdfErrorMessage({ message: "HTTP 404", status: 404 }, cdn);
    expect(msg).toContain("404");
    expect(msg).toContain("cdn.example.com");
    expect(msg).not.toContain("Drive");
  });

  it("derives the status from the message when no status field is set", () => {
    const msg = friendlyPdfErrorMessage(new Error("HTTP 403"), cdn);
    expect(msg).toContain("403");
    expect(msg).not.toContain("Drive");
  });

  it("HTML-instead-of-PDF on a CDN link points at the URL, not Drive sharing", () => {
    const msg = friendlyPdfErrorMessage(new Error("Source is an HTML page, not a PDF"), cdn);
    expect(msg).toContain("web page");
    expect(msg).not.toContain("Drive");
  });
});

describe("friendlyPdfErrorMessage — Drive sources keep the sharing hint", () => {
  it("403 on a Drive link", () => {
    expect(friendlyPdfErrorMessage({ status: 403 }, drive)).toBe(DRIVE_PRIVATE_MSG);
  });

  it("404 through the drive proxy", () => {
    expect(friendlyPdfErrorMessage({ status: 404 }, proxy)).toBe(DRIVE_PRIVATE_MSG);
  });
});

describe("friendlyPdfErrorMessage — other failures unchanged", () => {
  it("503 is a busy message", () => {
    expect(friendlyPdfErrorMessage({ status: 503 }, cdn)).toMatch(/busy/i);
  });

  it("truncated download stays actionable", () => {
    const msg = friendlyPdfErrorMessage(
      new Error("Content-Length header of network response exceeds response Body"),
      cdn
    );
    expect(msg).toMatch(/cut short/i);
  });

  it("never exposes the raw pdf.js invalid structure error", () => {
    const msg = friendlyPdfErrorMessage(
      { name: "InvalidPDFException", message: "Invalid PDF structure." },
      cdn,
    );
    expect(msg).toMatch(/valid PDF/i);
    expect(msg).not.toContain("Invalid PDF structure");
  });

  it("maps a prematurely closed stream to retry guidance", () => {
    expect(friendlyPdfErrorMessage(new Error("stream ended unexpectedly"), cdn)).toMatch(/cut short/i);
  });
});
