import notesDefaultThumb from "../assets/thumbnails/notes-default.svg";
import pdfDefaultThumb from "../assets/thumbnails/pdf-default.svg";
import dppDefaultThumb from "../assets/thumbnails/dpp-default.svg";

/**
 * Extract YouTube video ID from various URL formats.
 */
export function extractYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Default thumbnail map by lecture type */
const defaultThumbnails: Record<string, string> = {
  NOTES: notesDefaultThumb,
  PDF: pdfDefaultThumb,
  DPP: dppDefaultThumb,
  TEST: dppDefaultThumb,
};

/**
 * Get the best available thumbnail URL for a lesson.
 * Priority: custom thumbnail > YouTube thumbnail > type-specific default > null
 */
export function getLessonThumbnail(
  thumbnailUrl: string | null | undefined,
  youtubeId: string | null | undefined,
  videoUrl: string | null | undefined,
  lectureType?: string | null
): string | null {
  if (thumbnailUrl) return thumbnailUrl;

  const ytId = youtubeId || extractYoutubeId(videoUrl);
  if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;

  if (lectureType && defaultThumbnails[lectureType]) {
    return defaultThumbnails[lectureType];
  }

  return null;
}

/**
 * Format a duration in seconds to a human-readable string.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
