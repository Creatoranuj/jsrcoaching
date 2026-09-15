/**
 * Admin-only PDF source health probe.
 *
 * Loads every lesson PDF / content URL for a course, classifies it with the
 * same helpers the student reader uses, and probes each one through the exact
 * runtime path (pdf-proxy / notion-page / resolve-storage-pdf) with the
 * admin's own session. Probes are ranged (first 1 KB) and capped at 6 in
 * flight so auditing a large course stays cheap on a mid-range WebView.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  archiveOrgPdfProxyUrl,
  extractNotionPageId,
  googleDocsPdfProxyUrl,
  googleDrivePdfProxyUrl,
  isArchiveOrg,
  isGoogleDocs,
  isGoogleDrive,
  isGoogleSheets,
  isJsDelivrCdn,
  isNaveenBharatStorage,
  isNotion,
  notionPageProxyUrl,
  remotePdfProxyUrl,
  renderablePdfUrl,
} from "@/lib/pdfViewerUrl";
import { getNaveenStorageViewId } from "@/lib/native/naveenStoragePdf";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://wegamscqtvqhxowlskfm.supabase.co";
const FUNCTIONS_BASE = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1`;

const CONCURRENCY = 6;
const PROBE_TIMEOUT_MS = 30_000;

export type SourceKind =
  | "drive"
  | "google-docs"
  | "google-sheets"
  | "notion"
  | "telegram-storage"
  | "jsdelivr"
  | "archive"
  | "direct-pdf"
  | "unknown";

export const SOURCE_LABEL: Record<SourceKind, string> = {
  drive: "Google Drive",
  "google-docs": "Google Docs",
  "google-sheets": "Google Sheets",
  notion: "Notion",
  "telegram-storage": "Telegram storage",
  jsdelivr: "GitHub CDN (jsDelivr)",
  archive: "Archive.org",
  "direct-pdf": "Direct PDF",
  unknown: "Unknown",
};

export type ProbeStatus = "pending" | "checking" | "ok" | "warn" | "fail";

export interface PdfSourceRow {
  key: string;
  lessonTitle: string;
  fileName: string;
  field: "video_url" | "class_pdf_url" | "lesson_pdfs";
  url: string;
  kind: SourceKind;
  status: ProbeStatus;
  httpStatus?: number;
  contentType?: string;
  bytes?: number;
  elapsedMs?: number;
  signature?: string;
  reason?: string;
}

export function classifySource(url: string): SourceKind {
  if (!url) return "unknown";
  if (isNotion(url)) return "notion";
  if (isNaveenBharatStorage(url)) return "telegram-storage";
  if (isGoogleDrive(url)) return "drive";
  if (isGoogleSheets(url)) return "google-sheets";
  if (isGoogleDocs(url)) return "google-docs";
  if (isArchiveOrg(url)) return "archive";
  if (isJsDelivrCdn(url)) return "jsdelivr";
  if (/^https?:\/\//i.test(url)) return "direct-pdf";
  return "unknown";
}

interface ProbeResult {
  status: ProbeStatus;
  httpStatus?: number;
  contentType?: string;
  bytes?: number;
  elapsedMs?: number;
  signature?: string;
  reason?: string;
}

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function probeSource(
  url: string,
  kind: SourceKind,
  signal: AbortSignal,
): Promise<ProbeResult> {
  const startedAt = performance.now();
  const token = await accessToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  // Notion pages render from a JSON recordMap, not PDF bytes.
  if (kind === "notion") {
    const id = extractNotionPageId(url);
    if (!id) return { status: "fail", reason: "No Notion page id in URL" };
    const res = await fetch(notionPageProxyUrl(id), { signal });
    if (!res.ok) {
      return { status: "fail", httpStatus: res.status, reason: await shortBody(res) };
    }
    const json = await res.json().catch(() => null);
    if (!json?.recordMap?.block) {
      return { status: "fail", httpStatus: res.status, reason: "Empty recordMap — page not public" };
    }
    return { status: "ok", httpStatus: res.status, contentType: "application/json", signature: "recordMap", elapsedMs: Math.round(performance.now() - startedAt) };
  }

  // Telegram-backed storage viewer → authenticated byte resolver.
  if (kind === "telegram-storage") {
    const viewId = getNaveenStorageViewId(url);
    if (!viewId) {
      // A direct .pdf on that host is proxied like any other CDN file.
      return probeBytes(remotePdfProxyUrl(url), authHeaders, signal);
    }
    const res = await fetch(`${FUNCTIONS_BASE}/resolve-storage-pdf`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json", Range: "bytes=0-1023" },
      body: JSON.stringify({ view_id: viewId }),
      signal,
    });
    return interpret(res, startedAt);
  }

  const proxied = proxyUrlFor(url, kind);
  if (!proxied) return { status: "fail", reason: "Could not build a proxy URL for this link" };
  return probeBytes(proxied, authHeaders, signal, startedAt);
}

function proxyUrlFor(url: string, kind: SourceKind): string | null {
  switch (kind) {
    case "drive":
      return googleDrivePdfProxyUrl(url);
    case "google-docs":
    case "google-sheets":
      return googleDocsPdfProxyUrl(url);
    case "archive":
      return archiveOrgPdfProxyUrl(url) ?? remotePdfProxyUrl(url);
    case "jsdelivr":
      return renderablePdfUrl(url);
    case "direct-pdf":
      return remotePdfProxyUrl(url);
    default:
      return null;
  }
}

async function probeBytes(
  target: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  startedAt = performance.now(),
): Promise<ProbeResult> {
  const res = await fetch(target, {
    headers: { ...headers, Range: "bytes=0-1023" },
    signal,
  });
  return interpret(res, startedAt);
}

async function shortBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 160);
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function interpret(res: Response, startedAt: number): Promise<ProbeResult> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok && res.status !== 206) {
    return { status: "fail", httpStatus: res.status, contentType, reason: await shortBody(res), elapsedMs: Math.round(performance.now() - startedAt) };
  }
  const buf = await res.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
  if (!head.startsWith("%PDF")) {
    return {
      status: "warn",
      httpStatus: res.status,
      contentType,
      bytes: buf.byteLength,
      elapsedMs: Math.round(performance.now() - startedAt),
      signature: head || "empty",
      reason: `Response is not PDF bytes (${contentType || "unknown type"})`,
    };
  }
  return { status: "ok", httpStatus: res.status, contentType, bytes: buf.byteLength, signature: "%PDF-", elapsedMs: Math.round(performance.now() - startedAt) };
}

export interface CourseOption {
  id: number;
  title: string;
}

export function usePdfSourceHealth() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [rows, setRows] = useState<PdfSourceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await supabase
        .from("courses")
        .select("id, title")
        .order("title");
      if (cancelled) return;
      if (err) setError(err.message);
      else setCourses((data ?? []) as CourseOption[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cancel any in-flight probes on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const load = useCallback(async (courseId: number | "all") => {
    setLoading(true);
    setError(null);
    try {
      let lessonQuery = supabase
        .from("lessons")
        .select("id, title, class_pdf_url, video_url, lecture_type, course_id")
        .order("position");
      if (courseId !== "all") lessonQuery = lessonQuery.eq("course_id", courseId);
      const { data: lessons, error: lessonErr } = await lessonQuery;
      if (lessonErr) throw lessonErr;

      const lessonList = lessons ?? [];
      const titleById = new Map(lessonList.map((l) => [l.id, l.title]));
      const ids = lessonList.map((l) => l.id);

      let attachments: { id: string; lesson_id: string; file_url: string; file_name: string }[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200);
        if (slice.length === 0) break;
        const { data, error: pdfErr } = await supabase
          .from("lesson_pdfs")
          .select("id, lesson_id, file_url, file_name")
          .in("lesson_id", slice);
        if (pdfErr) throw pdfErr;
        attachments = attachments.concat((data ?? []) as typeof attachments);
      }

      const next: PdfSourceRow[] = [];
      const seen = new Set<string>();
      const add = (row: PdfSourceRow) => {
        const normalized = row.url.trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        next.push(row);
      };
      for (const lesson of lessonList) {
        if (lesson.class_pdf_url) {
          add({
            key: `lesson:${lesson.id}`,
            lessonTitle: lesson.title,
            fileName: "Class notes",
            field: "class_pdf_url",
            url: lesson.class_pdf_url,
            kind: classifySource(lesson.class_pdf_url),
            status: "pending",
          });
        }
        if (lesson.video_url && ["PDF", "DPP", "DPP_ATTEMPT", "NOTES"].includes((lesson.lecture_type ?? "").toUpperCase())) {
          add({
            key: `lesson-video:${lesson.id}`,
            lessonTitle: lesson.title,
            fileName: lesson.lecture_type || "Document",
            field: "video_url",
            url: lesson.video_url,
            kind: classifySource(lesson.video_url),
            status: "pending",
          });
        }
      }
      for (const att of attachments) {
        add({
          key: `pdf:${att.id}`,
          lessonTitle: titleById.get(att.lesson_id) ?? "(unknown lesson)",
          fileName: att.file_name,
          field: "lesson_pdfs",
          url: att.file_url,
          kind: classifySource(att.file_url),
          status: "pending",
        });
      }
      setRows(next);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const runProbes = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);

    const snapshot = rows;
    setRows((prev) => prev.map((r) => ({ ...r, status: "pending" as ProbeStatus })));

    let cursor = 0;
    const worker = async () => {
      while (cursor < snapshot.length && !controller.signal.aborted) {
        const index = cursor++;
        const row = snapshot[index];
        setRows((prev) =>
          prev.map((r) => (r.key === row.key ? { ...r, status: "checking" } : r)),
        );
        const probeController = new AbortController();
        const abortProbe = () => probeController.abort();
        controller.signal.addEventListener("abort", abortProbe, { once: true });
        const timer = window.setTimeout(() => probeController.abort(), PROBE_TIMEOUT_MS);
        let result: ProbeResult;
        try {
          result = await probeSource(row.url, row.kind, probeController.signal);
        } catch (e) {
          result = {
            status: controller.signal.aborted ? "warn" : "fail",
            reason: probeController.signal.aborted && !controller.signal.aborted ? "Probe timed out" : (e as Error).message,
          };
        } finally {
          window.clearTimeout(timer);
          controller.signal.removeEventListener("abort", abortProbe);
        }
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, ...result } : r)));
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
  }, [rows]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  return { courses, rows, loading, running, error, load, runProbes, stop };
}