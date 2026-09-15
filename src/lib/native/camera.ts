/**
 * Camera helper — uses native Capacitor Camera on Android/iOS, falls back
 * to <input type=file capture> on web. Always returns a File suitable for
 * upload to Supabase storage.
 *
 * Hardened error handling:
 *  - Detects platform support before invoking native APIs.
 *  - Explicit permission request flow with friendly errors.
 *  - Catches WebView "fetch failed" / base64 corruption paths.
 */
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

export type PickSource = "camera" | "gallery";

export class CameraPermissionError extends Error {
  constructor(message: string, public readonly kind: "camera" | "photos") {
    super(message);
    this.name = "CameraPermissionError";
  }
}

const isNative = async () => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

function base64ToFile(base64: string, filename: string, mime = "image/jpeg"): File {
  // Decode base64 → bytes directly. Avoids fetch(dataUrl), which throws
  // "Failed to fetch" inside the Android WebView under strict CSP for large
  // payloads — that was the source of the reported "fetch failed" error.
  try {
    const bin = atob(base64);
    const len = bin.length;
    if (!len) throw new Error("Empty image payload");
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch (e) {
    logger.error("[camera] base64ToFile decode failed", e);
    throw new Error("Couldn't read the captured photo. Please try again.", { cause: e });
  }
}

async function ensurePermissions(
  source: PickSource,
): Promise<void> {
  const { Camera } = await import("@capacitor/camera");
  const needed: ("camera" | "photos")[] =
    source === "camera" ? ["camera"] : ["photos"];
  let perm;
  try {
    perm = await Camera.checkPermissions();
  } catch (e) {
    console.warn("[camera] checkPermissions failed", e);
    perm = {} as Record<string, string>;
  }
  const missing = needed.filter((k) => (perm as any)[k] !== "granted");
  if (!missing.length) return;
  let req;
  try {
    req = await Camera.requestPermissions({ permissions: missing });
  } catch (e) {
    logger.error("[camera] requestPermissions failed", e);
    throw new CameraPermissionError(
      source === "camera"
        ? "Couldn't request camera access. Enable it in Settings."
        : "Couldn't request photo library access. Enable it in Settings.",
      source === "camera" ? "camera" : "photos",
    );
  }
  for (const k of missing) {
    if ((req as any)[k] !== "granted") {
      const kind = k === "camera" ? "camera" : "photos";
      throw new CameraPermissionError(
        kind === "camera"
          ? "Camera permission denied. Enable it in Settings > Apps > JSR COACHING."
          : "Photo library permission denied. Enable it in Settings > Apps > JSR COACHING.",
        kind,
      );
    }
  }
}

/**
 * Pick or capture a photo. Returns null if the user cancels.
 * Throws CameraPermissionError if permission is denied.
 */
export async function pickPhoto(source: PickSource = "camera"): Promise<File | null> {
  if (await isNative()) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    try {
      await ensurePermissions(source);
      // Use Uri (file path) instead of Base64 — Base64 doubles the photo in
      // JS heap (a 4 MB JPEG → ~5.5 MB string + decoded bytes), which on
      // 1–2 GB Android devices is enough to OOM-kill the WebView right
      // after capture. Reading the file URI as a Blob keeps the bytes in
      // native memory and lets the browser stream-decode.
      const photo = await Camera.getPhoto({
        quality: 80,
        width: 1024,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
        correctOrientation: true,
        presentationStyle: "fullscreen",
      });
      const uri = photo?.webPath || (photo as any)?.path;
      if (!uri) return null;
      const prefix = source === "camera" ? "scan" : "photo";
      const mime = photo.format ? `image/${photo.format}` : "image/jpeg";
      const ext = (photo.format || "jpg").replace(/^image\//, "");
      try {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        return new File([blob], `${prefix}_${Date.now()}.${ext}`, { type: blob.type || mime });
      } catch (fetchErr) {
        logger.error("[camera] fetch(uri) failed", fetchErr);
        toast.error("Couldn't read the captured photo. Please try again.");
        return null;
      }
    } catch (e: unknown) {
      const msg = String(getErrorMessage(e) ?? e ?? "");
      if (/cancel/i.test(msg) || /User cancelled/i.test(msg)) return null;
      if (e instanceof CameraPermissionError) {
        toast.error(getErrorMessage(e));
        throw e;
      }
      if (/fetch/i.test(msg) || /Failed to fetch/i.test(msg)) {
        toast.error("Couldn't read the photo from the camera. Please try again.");
      } else if (/No image/i.test(msg) || /No photo/i.test(msg)) {
        toast.error("No photo captured. Try again.");
      } else {
        toast.error(`Camera error: ${msg || "Unknown error"}`);
      }
      logger.error("[camera] pickPhoto failed", e);
      throw e instanceof Error ? e : new Error(msg || "Camera error");
    }
  }

  // Web fallback
  return new Promise<File | null>((resolve) => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      if (source === "camera") input.setAttribute("capture", "environment");
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
    } catch (e) {
      logger.error("[camera] web fallback failed", e);
      toast.error("Couldn't open camera/file picker.");
      resolve(null);
    }
  });
}
