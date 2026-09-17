import { supabase } from "../integrations/supabase/client";
import { reportError } from "./sentry";

export interface BunnyUploadResult {
  cdnUrl: string;
  fileName: string;
}

export interface BunnyVideoInfo {
  name: string;
  cdnUrl: string;
  size: number;
}

/**
 * Upload a video file to Bunny.net CDN via the edge function proxy.
 */
export const uploadToBunnyCdn = async (
  file: File,
  folder: string = ""
): Promise<BunnyUploadResult | null> => {
  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  // Convert file to base64 for edge function transport
  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  );

  const { data, error } = await supabase.functions.invoke("bunny-cdn", {
    body: {
      action: "upload",
      fileName: filePath,
      fileBase64: base64,
      contentType: file.type,
    },
  });

  if (error || !data?.cdnUrl) {
    reportError(error ?? new Error("BunnyCDN upload returned no cdnUrl"), {
      surface: "bunnyCdn",
      stage: "upload",
      message: error?.message ?? "No CDN URL returned",
    });
    return null;
  }

  return { cdnUrl: data.cdnUrl, fileName: filePath };
};

/**
 * List files in a Bunny.net storage zone folder.
 */
export const listBunnyFiles = async (folder: string = ""): Promise<BunnyVideoInfo[]> => {
  const { data, error } = await supabase.functions.invoke("bunny-cdn", {
    body: { action: "list", folder },
  });

  if (error || !data?.files) return [];
  return data.files;
};

/**
 * Get a short-lived playback URL for a Bunny.net file.
 *
 * Pass `lessonId` for anything a student watches: the edge function checks the
 * lesson's enrollment before signing, and the returned link expires (~4h).
 * Staff (admin/teacher) may omit it for admin-panel previews. Because the link
 * expires, don't cache it — call this again when playback starts.
 */
export const getBunnyCdnUrl = async (
  fileName: string,
  lessonId?: string
): Promise<string | null> => {
  const { data, error } = await supabase.functions.invoke("bunny-cdn", {
    body: { action: "stream-url", fileName, lesson_id: lessonId },
  });

  if (error || !data?.cdnUrl) {
    reportError(error ?? new Error("BunnyCDN stream-url returned no cdnUrl"), {
      surface: "bunnyCdn",
      stage: "stream-url",
      message: error?.message ?? "No CDN URL returned",
    });
    return null;
  }
  return data.cdnUrl;
};

/**
 * Check if a URL is a Bunny CDN URL.
 */
export const isBunnyCdnUrl = (url: string): boolean => /\.b-cdn\.net/i.test(url);
