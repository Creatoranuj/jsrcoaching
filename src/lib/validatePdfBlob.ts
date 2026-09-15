const PDF_HEADER_SCAN_BYTES = 1024;

/**
 * Reject empty and HTML/error responses before they are transferred to pdf.js.
 * ISO 32000 readers allow a PDF header to appear within the first 1024 bytes,
 * so this also accepts files with a short binary or comment preamble.
 */
export async function validatePdfBlob(blob: Blob): Promise<void> {
  if (blob.size === 0) throw new Error("Empty PDF response");

  const contentType = (blob.type || "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new Error("Source is an HTML page, not a PDF");
  }

  const prefixBytes = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, PDF_HEADER_SCAN_BYTES)).arrayBuffer(),
  );
  const prefix = new TextDecoder("latin1").decode(prefixBytes);
  if (!prefix.includes("%PDF-")) {
    if (/^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(prefix)) {
      throw new Error("Source is an HTML page, not a PDF");
    }
    throw new Error("Source did not return valid PDF bytes");
  }
}