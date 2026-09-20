import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadSiteSettingRows } from "@/lib/siteSettingsCache";

/**
 * Admin-controlled toggles for the lesson page.
 *
 * Same storage + cache shape as usePlayerReaderControls: one row per flag in
 * `site_settings` (key/value text), read once and cached for 5 minutes.
 * Every flag defaults to ON so nothing changes until an admin flips it.
 */
export const LESSON_FEATURE_KEYS = {
  chipStrip: "lesson_chip_strip",
  chipComments: "lesson_chip_comments",
  chipAttachment: "lesson_chip_attachment",
  chipNotes: "lesson_chip_notes",
  chipAskDoubt: "lesson_chip_ask_doubt",
  chipTimeline: "lesson_chip_timeline",
  chipMyDoubts: "lesson_chip_my_doubts",
  chipBookmarks: "lesson_chip_bookmarks",
  chipMentors: "lesson_chip_mentors",
  chipLike: "lesson_chip_like",
  chipRating: "lesson_chip_rating",
  pdfDownload: "lesson_pdf_download",
  notesAutoScroll: "lesson_notes_autoscroll",
  readerAutoScroll: "lesson_reader_autoscroll",
  sadguruAgent: "sadguru_agent_enabled",
} as const;

export type LessonFeatureFlag = keyof typeof LESSON_FEATURE_KEYS;

export type LessonFeatureFlags = Record<LessonFeatureFlag, boolean>;

export const LESSON_FEATURE_DEFAULTS: LessonFeatureFlags = {
  chipStrip: true,
  chipComments: true,
  chipAttachment: true,
  chipNotes: true,
  chipAskDoubt: true,
  chipTimeline: true,
  chipMyDoubts: true,
  chipBookmarks: true,
  chipMentors: true,
  chipLike: true,
  chipRating: true,
  pdfDownload: true,
  notesAutoScroll: true,
  readerAutoScroll: true,
  sadguruAgent: true,
};

export const LESSON_FEATURE_QUERY_KEY = ["site_settings", "lesson_features"] as const;

function isTruthy(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true; // unset → default ON
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export function parseLessonFeatureRows(
  rows: { key: string; value: string | null }[],
): LessonFeatureFlags {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...LESSON_FEATURE_DEFAULTS };
  (Object.keys(LESSON_FEATURE_KEYS) as LessonFeatureFlag[]).forEach((flag) => {
    const raw = map.get(LESSON_FEATURE_KEYS[flag]);
    out[flag] = raw === undefined ? LESSON_FEATURE_DEFAULTS[flag] : isTruthy(raw);
  });
  return out;
}

export function useLessonFeatureFlags(): LessonFeatureFlags & { isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: LESSON_FEATURE_QUERY_KEY,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const rows = await loadSiteSettingRows(Object.values(LESSON_FEATURE_KEYS));
      return parseLessonFeatureRows(rows);
    },
  });

  return { ...LESSON_FEATURE_DEFAULTS, ...(data || {}), isLoading };
}

/**
 * Provider-free access to the same flags.
 *
 * Reader surfaces (library doc reader, PDF viewer, Notion notes) render outside
 * the react-query tree in some contexts and in tests, so they cannot use
 * `useLessonFeatureFlags`. This variant caches one fetch per session, defaults
 * to ON and never throws — a failed read simply keeps the feature visible.
 */
let flagsCache: LessonFeatureFlags | null = null;
let flagsInflight: Promise<LessonFeatureFlags> | null = null;

export function fetchLessonFeatureFlags(): Promise<LessonFeatureFlags> {
  if (flagsCache) return Promise.resolve(flagsCache);
  if (!flagsInflight) {
    flagsInflight = (async () => {
      const rows = await loadSiteSettingRows(Object.values(LESSON_FEATURE_KEYS));
      const parsed = parseLessonFeatureRows(rows);
      flagsCache = parsed;
      return parsed;
    })().catch((err) => {
      flagsInflight = null;
      throw err;
    });
  }
  return flagsInflight;
}

/** Test/admin helper — drops the session cache so the next read refetches. */
export function resetLessonFeatureFlagsCache(): void {
  flagsCache = null;
  flagsInflight = null;
}

export function useLessonFeatureFlag(flag: LessonFeatureFlag): boolean {
  const [enabled, setEnabled] = useState<boolean>(
    flagsCache ? flagsCache[flag] : LESSON_FEATURE_DEFAULTS[flag],
  );
  useEffect(() => {
    let mounted = true;
    fetchLessonFeatureFlags()
      .then((f) => {
        if (mounted) setEnabled(f[flag]);
      })
      .catch(() => {
        /* keep default ON */
      });
    return () => {
      mounted = false;
    };
  }, [flag]);
  return enabled;
}
