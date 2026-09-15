import { useQuery } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";

export interface HeroData {
  title: string;
  subtitle: string;
  cta_text: string;
}

export const useHero = () => {
  return useQuery<HeroData | null>({
    queryKey: ["hero", "content"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("hero")
          .select("title,subtitle,cta_text")
          .eq("is_active", true)
          .order("position", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error || !data) return null;
        return data as HeroData;
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 60 * 5,
  });
};
