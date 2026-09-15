/** Classify a pdf.js load error for crash telemetry. */
export function classifyPdfError(err: Error): string {
  const m = (err?.message || "").toLowerCase();
  if (m.includes("memory") || err?.name === "RangeError") return "OutOfMemory";
  if (m.includes("missing") || m.includes("not found") || m.includes("http")) return "FileNotFound";
  if (m.includes("worker") || m.includes("fetch dynamically")) return "WorkerFailed";
  if (m.includes("invalid") || m.includes("corrupt")) return "InvalidPdf";
  return "Unknown";
}
