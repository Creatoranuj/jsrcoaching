import { useState, useRef, useEffect, useCallback } from "react";
import { reportError } from "@/lib/sentry";
import { supabase } from "../../integrations/supabase/client";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Trash2, Loader2, X } from "lucide-react";
import ProfileAvatar from "./ProfileAvatar";
import { pickPhoto } from "@/lib/native/camera";
import { getErrorMessage } from "@/lib/errorMessage";

interface AvatarUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currentAvatarUrl?: string | null;
  fullName?: string | null;
  onUploadComplete: (url: string | null) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Memory-safe downscale.
 *  Old impl decoded the FULL JPEG into an <img> first (~48 MB RGBA for a
 *  4032×3024 phone photo) → on 1–2 GB Android the WebView OOM-killed itself
 *  right after capture. createImageBitmap with resizeWidth/Height does the
 *  decode + downscale in a single native step → peak heap stays under ~3 MB.
 *  Object URL fallback (older WebView) is revoked immediately after decode. */
const compressImage = async (file: File): Promise<Blob> => {
  const MAX_DIM = 512;
  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      // Two-step: peek dimensions, then decode at target size.
      const probe = await createImageBitmap(file);
      const ratio = Math.min(1, MAX_DIM / Math.max(probe.width, probe.height));
      const w = Math.max(1, Math.round(probe.width * ratio));
      const h = Math.max(1, Math.round(probe.height * ratio));
      probe.close?.();
      bitmap = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: "medium" });
    }
  } catch {
    bitmap = null;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  if (bitmap) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
  } else {
    // Older WebView fallback — still safer than before: revoke URL immediately.
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = objectUrl!;
    });
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    let w = img.width, h = img.height;
    if (w > MAX_DIM || h > MAX_DIM) {
      if (w > h) { h = (h / w) * MAX_DIM; w = MAX_DIM; }
      else { w = (w / h) * MAX_DIM; h = MAX_DIM; }
    }
    canvas.width = w; canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("encode failed")),
      "image/jpeg",
      0.8,
    );
  });
};

const AvatarUploadModal = ({ isOpen, onClose, userId, currentAvatarUrl, fullName, onUploadComplete }: AvatarUploadModalProps) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke the previous preview blob URL whenever it changes or the modal
  // closes. Prevents native-side memory growth across repeat captures.
  useEffect(() => {
    return () => {
      if (preview && preview.startsWith("blob:")) {
        try { URL.revokeObjectURL(preview); } catch { /* noop */ }
      }
    };
  }, [preview]);

  const setPreviewSafely = useCallback((next: string | null) => {
    setPreview((prev) => {
      if (prev && prev.startsWith("blob:") && prev !== next) {
        try { URL.revokeObjectURL(prev); } catch { /* noop */ }
      }
      return next;
    });
  }, []);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG, or WebP images allowed");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Image must be under 5MB");
      return;
    }

    setSelectedFile(file);
    setPreviewSafely(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      const compressed = await compressImage(selectedFile);
      const filePath = `${userId}/avatar_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, compressed, { contentType: "image/jpeg", upsert: true });

      if (uploadError) throw uploadError;

      // `avatars` bucket is private (workspace policy blocks public buckets),
      // so `getPublicUrl` returns a URL that 403s. Use a long-lived signed URL
      // instead (1 year — the app-wide max we allow). Community feeds also
      // read this URL and don't have per-user auth context.
      const { data: signed, error: signErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Failed to sign avatar URL");
      const publicUrl = signed.signedUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", userId);

      if (updateError) throw updateError;

      onUploadComplete(publicUrl);
      toast.success("Avatar updated!");
      onClose();
    } catch (err: unknown) {
      reportError(err, { surface: "AvatarUploadModal.upload" });
      toast.error("Failed to upload avatar");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);

      if (error) throw error;
      onUploadComplete(null);
      toast.success("Avatar removed");
      onClose();
    } catch (err: unknown) {
      toast.error("Failed to remove avatar");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm mx-4 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg text-foreground">Change Avatar</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close avatar dialog">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col items-center gap-4">
          <ProfileAvatar
            avatarUrl={preview || currentAvatarUrl}
            fullName={fullName}
            userId={userId}
            size="lg"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={async () => {
                try {
                  const file = await pickPhoto("camera");
                  if (!file) return;
                  if (!ALLOWED_TYPES.includes(file.type)) {
                    toast.error("Only JPG, PNG, or WebP images allowed");
                    return;
                  }
                  if (file.size > MAX_SIZE) {
                    toast.error("Image must be under 5MB");
                    return;
                  }
                  setSelectedFile(file);
                  setPreviewSafely(URL.createObjectURL(file));
                } catch (e: unknown) {
                  toast.error(getErrorMessage(e) ?? "Camera unavailable");
                }
              }}
              disabled={uploading}
            >
              <Camera className="h-4 w-4" />
              Take Photo
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <ImageIcon className="h-4 w-4" />
              Gallery
            </Button>
            {currentAvatarUrl && (
              <Button
                variant="outline"
                className="gap-2 text-destructive border-destructive"
                onClick={handleRemove}
                disabled={uploading}
                aria-label="Remove current avatar"
              >

                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {preview && (
            <Button onClick={handleUpload} disabled={uploading} className="w-full">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Avatar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AvatarUploadModal;
