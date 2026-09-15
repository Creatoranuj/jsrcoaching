/**
 * Cross-device PDF reading progress.
 *
 * The device-local IndexedDB copy (`services/libraryNotes.ts`) stays the source
 * of truth for instant restore — it works offline and needs no round trip. This
 * module mirrors that position into `public.document_progress`, which is
 * owner-scoped in the database, so a reinstall or a second phone resumes on the
 * same page.
 *
 * Writes go through the offline mutation queue: page moves are already debounced
 * by the reader, and the queue adds idempotency, backoff and a dead-letter path
 * so a dropped connection never loses the position.
 */
import { supabase } from "../integrations/supabase/client";
import { enqueueMutation } from "../lib/offline/mutationQueue";
import { reportError } from "../lib/sentry";

/**
 * The generated `Database` types in this repo predate `public.document_progress`,
 * so the table is reached through an explicitly typed accessor instead of
 * hand-editing the generated file (which regenerates from the API).
 */
interface ProgressRow {
  current_page: number;
  total_pages: number | null;
  last_read_at: string;
}

interface ProgressTable {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<{ data: ProgressRow | null; error: unknown }>;
    };
  };
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict: string },
  ) => Promise<{ error: unknown }>;
}

export const documentProgressTable = (): ProgressTable =>
  (supabase as unknown as { from: (table: string) => ProgressTable }).from(
    "document_progress",
  );

export interface RemoteProgress {
  page: number;
  totalPages: number | null;
  lastReadAt: string;
}

const clampPage = (page: number): number =>
  Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

const percentOf = (page: number, total: number | null | undefined): number => {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((page / total) * 1000) / 10);
};

/** Queue a progress write for the signed-in user. No-op when signed out. */
export async function queueDocumentProgress(params: {
  documentKey: string;
  page: number;
  totalPages?: number | null;
  source?: string;
  documentVersion?: string | null;
}): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;
    const page = clampPage(params.page);
    enqueueMutation("document_progress.upsert", {
      user_id: userId,
      document_key: params.documentKey,
      current_page: page,
      total_pages: params.totalPages ?? null,
      completion_percent: percentOf(page, params.totalPages),
      source: params.source ?? "other",
      document_version: params.documentVersion ?? null,
      last_read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    reportError(err, { surface: "documentProgress:queue" });
  }
}

/** Read the stored position for this document, or null when there is none. */
export async function fetchDocumentProgress(
  documentKey: string,
): Promise<RemoteProgress | null> {
  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user?.id) return null;
    const { data, error } = await documentProgressTable()
      .select("current_page, total_pages, last_read_at")
      .eq("document_key", documentKey)
      .maybeSingle();
    if (error || !data) return null;
    return {
      page: clampPage(data.current_page),
      totalPages: data.total_pages ?? null,
      lastReadAt: String(data.last_read_at),
    };
  } catch {
    // Offline / cold start with no network — the local copy still restores.
    return null;
  }
}
