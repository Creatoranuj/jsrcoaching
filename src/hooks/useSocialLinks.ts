import { useQuery } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  is_active: boolean;
  position: number;
}

export const useSocialLinks = () => {
  return useQuery<SocialLink[]>({
    queryKey: ["social_links", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_links")
        .select("id,platform,url,is_active,position")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data as SocialLink[]) || [];
    },
    staleTime: 1000 * 60 * 5,
  });
};
