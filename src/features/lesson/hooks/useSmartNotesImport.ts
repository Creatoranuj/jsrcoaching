import { useCallback, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";
import { openExternal } from "@/lib/native/browser";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

type Options = {
  /** Guards state updates after unmount (from useProtectedSurface). */
  isMountedRef: MutableRefObject<boolean>;
  /** Editor textarea, focused after a successful link import. */
  editorRef: MutableRefObject<HTMLTextAreaElement | null>;
  setSmartNotesDraft: (updater: (prev: string) => string) => void;
  setSmartNotesEditing: (value: boolean) => void;
};

async function loadPdfjs() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs-dist ships loose ESM types here
  const pdfjs: any = await import("pdfjs-dist");
  try {
    const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  } catch {
    /* worker set elsewhere */
  }
  return pdfjs;
}

/**
 * Smart Notes importers (remote URL + local file) extracted from LessonView.
 * Behaviour is unchanged: both append parsed text/markdown to the editor draft.
 */
export function useSmartNotesImport({
  isMountedRef,
  editorRef,
  setSmartNotesDraft,
  setSmartNotesEditing,
}: Options) {
  const [smartNotesImportProgress, setSmartNotesImportProgress] = useState<number | null>(null);

  const importUrlToDraft = useCallback(async (rawUrl: string) => {
    const parsed = new URL(rawUrl);
    // SSRF hardening: block non-HTTPS + private-network hosts. Capacitor
    // WebView on Android can otherwise reach 192.168.x.x / 10.x router UIs.
    if (parsed.protocol !== 'https:') {
      toast.error("Only HTTPS URLs are supported");
      return;
    }
    const host = parsed.hostname.toLowerCase();
    const BLOCKED = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|0\.0\.0\.0)/i;
    if (BLOCKED.test(host)) {
      toast.error("Local network URLs are not allowed");
      return;
    }
    setSmartNotesImportProgress(5);
    try {
      const res = await fetch(parsed.toString(), { credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSmartNotesImportProgress(35);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const lower = parsed.pathname.toLowerCase();
      let appended = "";
      if (ct.startsWith("text/") || /\.(md|markdown|txt)$/.test(lower)) {
        appended = await res.text();
        setSmartNotesImportProgress(85);
      } else if (ct.includes("pdf") || lower.endsWith(".pdf")) {
        // OOM guard: cap remote PDF imports at 15 MB. Loading a 50 MB PDF as
        // an in-memory ArrayBuffer routinely crashes low-RAM Android WebViews.
        const openExternally = () => {
          openExternal(parsed.toString()).catch(() => { /* no-op */ });
        };
        const cl = Number(res.headers.get("content-length") || 0);
        if (cl && cl > MAX_PDF_BYTES) {
          toast.error("PDF too large (>15 MB)", {
            action: { label: "Open externally", onClick: openExternally },
          });
          throw new Error("PDF too large (>15 MB).");
        }
        const pdfjs = await loadPdfjs();
        const buf = await res.arrayBuffer();
        if (buf.byteLength > MAX_PDF_BYTES) {
          toast.error("PDF too large (>15 MB)", {
            action: { label: "Open externally", onClick: openExternally },
          });
          throw new Error("PDF too large (>15 MB).");
        }
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        let out = `# ${parsed.pathname.split("/").pop() || "PDF"}\n\n`;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          const txt = tc.items.map((it: { str: string }) => it.str).join(" ").replace(/\s+/g, " ").trim();
          if (txt) out += `\n\n## Page ${i}\n\n${txt}`;
          setSmartNotesImportProgress(35 + Math.round((i / doc.numPages) * 55));
        }
        appended = out;
      } else if (ct.startsWith("image/") || /\.(jpe?g|png|webp|gif|svg)$/.test(lower)) {
        appended = `![${parsed.pathname.split("/").pop() || "image"}](${parsed.toString()})`;
        setSmartNotesImportProgress(85);
      } else {
        appended = `[${parsed.toString()}](${parsed.toString()})`;
        setSmartNotesImportProgress(85);
      }
      if (!isMountedRef.current) return;
      setSmartNotesEditing(true);
      setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + appended);
      setSmartNotesImportProgress(100);
      toast.success("Link imported");
      requestAnimationFrame(() => {
        if (!isMountedRef.current) return;
        const ta = editorRef.current;
        if (ta) {
          ta.scrollIntoView({ behavior: "smooth", block: "center" });
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      });
    } catch (err: unknown) {
      logger.error("Smart Notes link import failed", err);
      toast.error(getErrorMessage(err) || "Link import failed");
      throw err;
    } finally {
      setTimeout(() => setSmartNotesImportProgress(null), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable refs/setters, matches previous inline callback
  }, []);

  // Shared importer: file input + drag-drop both call this.
  const importFileToDraft = useCallback(async (f: File) => {
    if (!f) return;
    try {
      const name = f.name || "file";
      const lower = name.toLowerCase();
      const type = (f.type || "").toLowerCase();
      // 1) Plain text / markdown
      if (type.startsWith("text/") || /\.(md|markdown|txt)$/.test(lower)) {
        const text = await f.text();
        setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + text);
        toast.success("Text file imported");
        return;
      }
      // 2) PDF — extract text with pdfjs-dist (lazy import)
      if (type === "application/pdf" || lower.endsWith(".pdf")) {
        if (f.size > MAX_PDF_BYTES) {
          toast.error("PDF too large (>15 MB)", {
            description: "Open it in your device's PDF reader instead of importing.",
            action: {
              label: "Open file",
              onClick: () => {
                try {
                  const url = URL.createObjectURL(f);
                  openExternal(url).catch(() => { /* no-op */ });
                  setTimeout(() => URL.revokeObjectURL(url), 5000);
                } catch { /* no-op */ }
              },
            },
          });
          return;
        }
        toast.info("PDF se text extract ho raha hai…");
        const pdfjs = await loadPdfjs();
        const buf = await f.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        let out = `# ${name.replace(/\.pdf$/i, "")}\n\n`;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          const txt = tc.items.map((it: { str: string }) => it.str).join(" ").replace(/\s+/g, " ").trim();
          if (txt) out += `\n\n## Page ${i}\n\n${txt}`;
        }
        setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + out);
        toast.success(`PDF imported (${doc.numPages} pages)`);
        return;
      }
      // 3) Image — embed as markdown image (base64 data URL)
      if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/.test(lower)) {
        const dataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result || ""));
          r.onerror = () => rej(r.error);
          r.readAsDataURL(f);
        });
        setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + `![${name}](${dataUrl})`);
        toast.success("Image embedded");
        return;
      }
      // Fallback: try as text
      const text = await f.text();
      setSmartNotesDraft((prev) => (prev ? prev + "\n\n" : "") + text);
    } catch (err: unknown) {
      logger.error("Smart Notes import failed", err);
      toast.error(getErrorMessage(err) || "Upload failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable setters, matches previous inline callback
  }, []);

  return { smartNotesImportProgress, importUrlToDraft, importFileToDraft };
}
