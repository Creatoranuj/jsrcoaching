import { describe, expect, it } from "vitest";
import { validatePdfBlob } from "../lib/validatePdfBlob";

describe("validatePdfBlob", () => {
  it("accepts a PDF header after a short preamble", async () => {
    const blob = new Blob(["comment before header\n%PDF-1.7\n"], { type: "application/octet-stream" });
    await expect(validatePdfBlob(blob)).resolves.toBeUndefined();
  });

  it("rejects an empty response", async () => {
    await expect(validatePdfBlob(new Blob([]))).rejects.toThrow("Empty PDF response");
  });

  it("rejects HTML even when the server labels it as a PDF", async () => {
    const blob = new Blob(["<!doctype html><title>Sign in</title>"], { type: "application/pdf" });
    await expect(validatePdfBlob(blob)).rejects.toThrow("HTML page");
  });

  it("rejects non-PDF binary data", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "application/octet-stream" });
    await expect(validatePdfBlob(blob)).rejects.toThrow("valid PDF bytes");
  });
});