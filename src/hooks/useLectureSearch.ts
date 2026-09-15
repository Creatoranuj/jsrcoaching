import { useQuery } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";

export interface LectureSearchResult {
  id: string;
  title: string;
  description: string | null;
  course_id: number;
  chapter_id: string | null;
  lecture_type: string;
  thumbnail_url: string | null;
  rank: number;
}

/**
 * Direct-query lecture search via the `search_lectures` RPC (pg_trgm).
 *
 * Replaces the DB-lookup portion of the `deep-search-lecture` edge function for
 * local results. The edge function is still used for Firecrawl-augmented
 * external web search, which requires server-side API keys.
 *
 * Free Tier: counts as a normal Postgres query, not an edge-function invocation
 * nor a Supabase Storage image transform.
 */
export function useLectureSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ["lecture-search", query],
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<LectureSearchResult[]> => {
      // Cast: `search_lectures` is added in a migration; supabase types are
      // regenerated after the migration runs.
      const { data, error } = await supabase.rpc("search_lectures", {
        _query: query,
        _limit: 20,
      });
      if (error) throw error;
      return (data ?? []) as LectureSearchResult[];
    },
  });
}
