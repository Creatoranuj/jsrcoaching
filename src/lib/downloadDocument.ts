// Cross-platform download helper for PDFs/documents.
//
// Native (Capacitor Android): fetch → Filesystem.writeFile into Documents,
// then surface the path via toast. On WebView, `<a download>` is unreliable;
// Filesystem is the only path that reliably lands a file the user can find.
//
// Web: standard anchor-download fallback. Same-origin works directly; cross-
// origin falls back to opening in a new tab (browser handles save UX).
import { isNative } from "./platform";

async function nativeDownload(url: string, filename: string): Promise<string> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const safeName = filename.replace(/[\\/:*?"<>|]+/g, "_") || "document.pdf";
  const name = /\.[a-z0-9]+$/i.test(safeName) ? safeName : `${safeName}.pdf`;
  const written = await Filesystem.writeFile({
    path: name,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  });
  return written.uri;
}

function webDownload(url: string, filename: string): void {
  const safeName = filename.replace(/[\\/:*?"<>|]+/g, "_") || "document.pdf";
  const name = /\.[a-z0-9]+$/i.test(safeName) ? safeName : `${safeName}.pdf`;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Downloads `url` and returns a human-readable destination string for toasts.
 * Throws on failure so callers can show an error.
 */
export async function downloadDocument(
  url: string,
  filename: string,
): Promise<{ location: string }> {
  if (isNative()) {
    try {
      const uri = await nativeDownload(url, filename);
      return { location: `Saved to Documents (${uri.split("/").pop() ?? "file"})` };
    } catch (e) {
      // Fall through to web path so the user still gets a file.
      console.warn("[downloadDocument] native path failed, falling back", e);
    }
  }
  webDownload(url, filename);
  return { location: "Started download" };
}
