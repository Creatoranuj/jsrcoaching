import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";

export interface HeroBanner {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  bg_color: string;
  badge_text: string | null;
  cta_text: string;
  cta_link: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type HeroBannerInsert = Omit<HeroBanner, "id" | "created_at" | "updated_at">;

// Hook for public dashboard — only active banners
export const useHeroBanners = () => {
  return useQuery({
    queryKey: ["hero_banners", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_banners")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data as unknown as HeroBanner[]) || [];
    },
    staleTime: 1000 * 60 * 5, // 5 min cache
  });
};

// Hook for admin panel — all banners
export const useAllHeroBanners = () => {
  return useQuery({
    queryKey: ["hero_banners", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_banners")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data as unknown as HeroBanner[]) || [];
    },
  });
};

export const useCreateBanner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (banner: HeroBannerInsert) => {
      const { data, error } = await supabase
        .from("hero_banners")
        .insert(banner)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as HeroBanner;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hero_banners"] });
      toast.success("Banner added");
    },
    onError: (e) => toast.error("Failed to add banner: " + e.message),
  });
};

export const useUpdateBanner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<HeroBanner> & { id: string }) => {
      const { error } = await supabase
        .from("hero_banners")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hero_banners"] });
      toast.success("Banner updated!");
    },
    onError: (e) => toast.error("Update failed: " + e.message),
  });
};

export const useDeleteBanner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("hero_banners")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hero_banners"] });
      toast.success("Banner deleted.");
    },
    onError: (e) => toast.error("Delete failed: " + e.message),
  });
};

export const useReorderBanners = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; position: number }[]) => {
      const promises = updates.map(({ id, position }) =>
        supabase.from("hero_banners").update({ position }).eq("id", id)
      );
      await Promise.all(promises);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hero_banners"] }),
    onError: (e) => toast.error("Reorder failed: " + e.message),
  });
};

export async function importBannerFromUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    throw new Error("URL must start with https://");
  }
  const { data, error } = await supabase.functions.invoke("import-banner-image", {
    body: { url: trimmed },
  });
  if (error) throw new Error(error.message || "Import failed");
  if (!data?.storage_uri) throw new Error("Import returned no storage URI");
  return data.storage_uri as string;
}
