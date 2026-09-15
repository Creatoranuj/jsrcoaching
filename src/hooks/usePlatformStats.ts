import { useQuery } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";

export interface PlatformStats {
  total_students: number;
  total_courses: number;
  total_teachers: number;
}

const FALLBACK: PlatformStats = {
  total_students: 500,
  total_courses: 50,
  total_teachers: 20,
};

const DAY = 1000 * 60 * 60 * 24;

/**
 * Fetches public platform counts via the `platform-stats` edge function.
 * (Replaces the previous `get_platform_stats` RPC — anon EXECUTE was
 * revoked on the RPC to satisfy Supabase linter 0028; the edge function
 * uses service_role internally and only returns aggregate counts.)
 * Cached for 24h in React Query — at most one network call per user per day.
 * Always returns a usable value (real data or hardcoded fallback) so the
 * landing UI never renders "0" or breaks.
 */
export const usePlatformStats = () => {
  const q = useQuery({
    queryKey: ["platform_stats"],
    queryFn: async (): Promise<PlatformStats> => {
      const { data, error } = await supabase.functions.invoke("platform-stats", { method: "GET" });
      if (error) throw error;
      return data as PlatformStats;
    },
    staleTime: DAY,
    gcTime: DAY,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  return {
    stats: q.data ?? FALLBACK,
    isLoading: q.isLoading,
    isError: q.isError,
  };
};