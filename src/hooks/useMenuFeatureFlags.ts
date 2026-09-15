import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Admin-controlled visibility switches for side-menu sections.
 *
 * Same storage + cache shape as useLessonFeatureFlags: one row per flag in
 * `site_settings` (key/value text). Every flag defaults to ON so nothing
 * changes until an admin flips it, and a failed read keeps sections visible.
 */
export const MENU_FEATURE_KEYS = {
  doubts: "menu_doubts",
  community: "menu_community",
  reports: "menu_reports",
  messages: "menu_messages",
} as const;

export type MenuFeatureFlag = keyof typeof MENU_FEATURE_KEYS;

export type MenuFeatureFlags = Record<MenuFeatureFlag, boolean>;

export const MENU_FEATURE_DEFAULTS: MenuFeatureFlags = {
  doubts: true,
  community: true,
  reports: true,
  messages: true,
};

export const MENU_FEATURE_QUERY_KEY = ["site_settings", "menu_features"] as const;

function isTruthy(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true; // unset → default ON
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

export function parseMenuFeatureRows(
  rows: { key: string; value: string | null }[],
): MenuFeatureFlags {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...MENU_FEATURE_DEFAULTS };
  (Object.keys(MENU_FEATURE_KEYS) as MenuFeatureFlag[]).forEach((flag) => {
    const raw = map.get(MENU_FEATURE_KEYS[flag]);
    out[flag] = raw === undefined ? MENU_FEATURE_DEFAULTS[flag] : isTruthy(raw);
  });
  return out;
}

export function useMenuFeatureFlags(): MenuFeatureFlags & { isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: MENU_FEATURE_QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", Object.values(MENU_FEATURE_KEYS));

      if (error) throw error;
      return parseMenuFeatureRows(rows || []);
    },
  });

  return { ...MENU_FEATURE_DEFAULTS, ...(data || {}), isLoading };
}
