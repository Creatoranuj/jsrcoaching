import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errorMessage";
import {
  checkUploadFile,
  checkThumbnailFile,
  checkVideoFile,
  randomObjectName,
  videoStoragePath,
  storageUri,
  VIDEO_SIGNED_URL_TTL,
} from "@/features/admin-upload/lib/uploadRules";

interface Params {
  /** Course the video is namespaced under in storage. */
  selectedCourseId: number | null;
  /** Called with the playable URL once a video upload finishes. */
  onVideoUrl: (url: string) => void;
  /** Called with the stored URI once a thumbnail upload finishes. */
  onThumbnailUrl: (uri: string) => void;
}

/**
 * Media half of the AdminUpload form: video + thumbnail file state,
 * uploads and drag handling. Rules come from uploadRules — unchanged.
 */
export function useAdminUploadForm({ selectedCourseId, onVideoUrl, onThumbnailUrl }: Params) {
  const [videoInputMode, setVideoInputMode] = useState<"url" | "file">("url");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoFileUploading, setVideoFileUploading] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoDragActive, setVideoDragActive] = useState(false);

  const [thumbnailInputMode, setThumbnailInputMode] = useState<"url" | "file">("url");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailFileUploading, setThumbnailFileUploading] = useState(false);
  const [thumbDragActive, setThumbDragActive] = useState(false);

  /** MIME + extension gate shared by every picker on the page. */
  const validateFile = (file: File): boolean => {
    const result = checkUploadFile(file);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    return true;
  };

  const handleVideoFileUpload = async (file: File) => {
    if (!validateFile(file)) return;
    const sizeCheck = checkVideoFile(file);
    if (!sizeCheck.ok) {
      toast.error(sizeCheck.error);
      return;
    }
    setVideoFile(file);
    setVideoFileUploading(true);
    setVideoUploadProgress(0);
    try {
      const fileName = randomObjectName(file.name);
      const filePath = videoStoragePath(selectedCourseId, fileName);
      const { error } = await supabase.storage.from('course-videos').upload(filePath, file, { upsert: false });

      if (error) throw error;
      setVideoUploadProgress(100);
      // course-videos is private, get signed URL
      const { data, error: signErr } = await supabase.storage.from('course-videos').createSignedUrl(filePath, VIDEO_SIGNED_URL_TTL);
      if (signErr) throw signErr;
      onVideoUrl(data.signedUrl);
      toast.success("Video uploaded to storage!");
    } catch (err: unknown) {
      toast.error("Video upload failed: " + getErrorMessage(err));
      setVideoFile(null);
    } finally {
      setVideoFileUploading(false);
    }
  };

  const handleThumbnailFileUpload = async (file: File) => {
    const imgCheck = checkThumbnailFile(file);
    if (!imgCheck.ok) {
      toast.error(imgCheck.error);
      return;
    }
    setThumbnailFile(file);
    setThumbnailFileUploading(true);
    try {
      const fileName = `thumbnails/${randomObjectName(file.name)}`;
      const { error } = await supabase.storage.from('content').upload(fileName, file, { upsert: false });
      if (error) throw error;
      onThumbnailUrl(storageUri('content', fileName));

      toast.success("Thumbnail uploaded!");
    } catch (err: unknown) {
      toast.error("Thumbnail upload failed: " + getErrorMessage(err));
      setThumbnailFile(null);
    } finally {
      setThumbnailFileUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent, setActive: (v: boolean) => void, _active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setActive(true);
    else if (e.type === "dragleave") setActive(false);
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVideoDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleVideoFileUpload(file);
  };

  const handleThumbDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setThumbDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleThumbnailFileUpload(file);
  };

  /** Clears picked media after a successful lesson save. */
  const resetMedia = () => {
    setVideoFile(null);
    setThumbnailFile(null);
    setVideoUploadProgress(0);
  };

  return {
    videoInputMode, setVideoInputMode,
    videoFile, videoFileUploading, videoUploadProgress,
    videoDragActive, setVideoDragActive,
    thumbnailInputMode, setThumbnailInputMode,
    thumbnailFile, thumbnailFileUploading,
    thumbDragActive, setThumbDragActive,
    validateFile,
    handleVideoFileUpload,
    handleThumbnailFileUpload,
    handleDrag,
    handleVideoDrop,
    handleThumbDrop,
    resetMedia,
  };
}
