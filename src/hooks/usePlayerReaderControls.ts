import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PLAYER_READER_KEYS = {
  infinityLogo: "player_infinity_logo",
  youtubeMask: "player_youtube_mask",
  readerZoom: "reader_zoom_controls",
} as const;

export const PLAYER_READER_DEFAULTS = {
  infinityLogo: true,
  youtubeMask: true,
  readerZoom: false,
} as const;

export type PlayerReaderFlags = {
  infinityLogo: boolean;
  youtubeMask: boolean;
  readerZoom: boolean;
};

export const PLAYER_READER_QUERY_KEY = ["site_settings", "player_reader_controls"] as const;

function isTruthy(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export function parsePlayerReaderRows(rows: { key: string; value: string | null }[]): PlayerReaderFlags {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    infinityLogo: isTruthy(map.get(PLAYER_READER_KEYS.infinityLogo) ?? String(PLAYER_READER_DEFAULTS.infinityLogo)),
    youtubeMask: isTruthy(map.get(PLAYER_READER_KEYS.youtubeMask) ?? String(PLAYER_READER_DEFAULTS.youtubeMask)),
    readerZoom: isTruthy(map.get(PLAYER_READER_KEYS.readerZoom) ?? String(PLAYER_READER_DEFAULTS.readerZoom)),
  };
}

export function usePlayerReaderControls() {
  const { data, isLoading } = useQuery({
    queryKey: PLAYER_READER_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", Object.values(PLAYER_READER_KEYS));

      if (error) throw error;
      return parsePlayerReaderRows(rows || []);
    },
  });

  return {
    ...PLAYER_READER_DEFAULTS,
    ...(data || {}),
    isLoading,
  };
}

export function useSetPlayerReaderControls() {
  const queryClient = useQueryClient();

  const setFlag = async (flag: keyof PlayerReaderFlags, value: boolean) => {
    const key = PLAYER_READER_KEYS[flag];
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("site_settings")
      .upsert({ key, value: String(value), updated_at: now }, { onConflict: "key" });

    if (error) throw error;

    queryClient.setQueryData<PlayerReaderFlags>(PLAYER_READER_QUERY_KEY, (prev) => ({
      ...PLAYER_READER_DEFAULTS,
      ...(prev || {}),
      [flag]: value,
    }));

    queryClient.invalidateQueries({ queryKey: PLAYER_READER_QUERY_KEY });
  };

  return { setFlag };
}
