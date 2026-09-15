import { supabase } from "../integrations/supabase/client";

/**
 * The `lecture-pdfs` bucket is private (RLS-gated by enrollment). Historical
 * rows in `lesson_pdfs.file_url` store the permanent `/object/public/...` URL
 * that worked when the bucket was public; new rows store a `storage://` URI.
 * Both forms must be turned into a short-lived signed URL before the browser
 * can fetch the bytes.
 *
 * Any other URL (Notion, Drive, external CDN, or attachments in a different
 * bucket) is returned untouched.
 */
const BUCKET = "lecture-pdfs";
const SIGNED_TTL_SECONDS = 60 * 60; // 1h — matches get-lesson-url edge fn.

export function extractLecturePdfPath(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  // storage://lecture-pdfs/<path>
  const storageMatch = /^storage:\/\/lecture-pdfs\/(.+)$/i.exec(fileUrl);
  if (storageMatch) return decodeURIComponent(storageMatch[1]);
  // https://<ref>.supabase.co/storage/v1/object/(public|sign)/lecture-pdfs/<path>[?...]
  const httpMatch = /\/lecture-pdfs\/([^?#]+)/i.exec(fileUrl);
  if (httpMatch && /supabase\.co\/storage\//i.test(fileUrl)) {
    return decodeURIComponent(httpMatch[1]);
  }
  return null;
}

export async function resolveLecturePdfUrl(fileUrl: string | null | undefined): Promise<string | null> {
  if (!fileUrl) return null;
  const path = extractLecturePdfPath(fileUrl);
  if (!path) return fileUrl; // Not a lecture-pdfs URL — pass through.
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
