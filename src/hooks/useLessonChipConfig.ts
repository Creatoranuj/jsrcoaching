import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LESSON_CHIP_CONFIG_KEY,
  emptyLessonChipConfig,
  parseLessonChipConfig,
  type LessonChipConfig,
} from "@/features/lesson/lib/lessonChipConfig";

export const LESSON_CHIP_CONFIG_QUERY_KEY = ["site_settings", "lesson_chip_config"] as const;

export async function fetchLessonChipConfig(): Promise<LessonChipConfig> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("key, value")
    .eq("key", LESSON_CHIP_CONFIG_KEY)
    .maybeSingle();
  if (error) throw error;
  return parseLessonChipConfig(data?.value ?? null);
}

/** Admin-managed chip visibility + custom chips. Empty config = today's behaviour. */
export function useLessonChipConfig(): LessonChipConfig {
  const { data } = useQuery({
    queryKey: LESSON_CHIP_CONFIG_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: fetchLessonChipConfig,
  });
  return data ?? emptyLessonChipConfig();
}
