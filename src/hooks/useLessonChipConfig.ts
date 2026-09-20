import { useQuery } from "@tanstack/react-query";
import { loadSiteSettingRows } from "@/lib/siteSettingsCache";
import {
  LESSON_CHIP_CONFIG_KEY,
  emptyLessonChipConfig,
  parseLessonChipConfig,
  type LessonChipConfig,
} from "@/features/lesson/lib/lessonChipConfig";

export const LESSON_CHIP_CONFIG_QUERY_KEY = ["site_settings", "lesson_chip_config"] as const;

export async function fetchLessonChipConfig(): Promise<LessonChipConfig> {
  const rows = await loadSiteSettingRows([LESSON_CHIP_CONFIG_KEY]);
  return parseLessonChipConfig(rows[0]?.value ?? null);
}

/** Admin-managed chip visibility + custom chips. Empty config = today's behaviour. */
export function useLessonChipConfig(): LessonChipConfig {
  const { data } = useQuery({
    queryKey: LESSON_CHIP_CONFIG_QUERY_KEY,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: fetchLessonChipConfig,
  });
  return data ?? emptyLessonChipConfig();
}
