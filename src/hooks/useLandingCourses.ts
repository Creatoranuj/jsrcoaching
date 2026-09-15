import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";

export interface LandingCourse {
  id: string;
  slug: string;
  badge: string;
  title: string;
  faculty: string;
  language: string;
  duration: string;
  start_date: string;
  seats: string | null;
  price_mrp: number | null;
  price_effective: number | null;
  short: string;
  image_url: string | null;
  route: string | null;
  course_id: number | null;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type LandingCourseInsert = Omit<LandingCourse, "id" | "created_at" | "updated_at">;

export const useLandingCourses = () =>
  useQuery({
    queryKey: ["landing_courses", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_courses")
        .select("id,slug,badge,title,faculty,language,duration,start_date,seats,price_mrp,price_effective,short,image_url,route,course_id,position,is_active,created_at,updated_at")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data as unknown as LandingCourse[]) || [];
    },
    staleTime: 1000 * 60 * 5,
  });

export const useAllLandingCourses = () =>
  useQuery({
    queryKey: ["landing_courses", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_courses")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data as unknown as LandingCourse[]) || [];
    },
  });

export const useCreateLandingCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: LandingCourseInsert) => {
      const { data, error } = await supabase
        .from("landing_courses")
        .insert(row as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as LandingCourse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing_courses"] });
      toast.success("Course added!");
    },
    onError: (e) => toast.error("Add failed: " + e.message),
  });
};

export const useUpdateLandingCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LandingCourse> & { id: string }) => {
      const { error } = await supabase
        .from("landing_courses")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing_courses"] });
      toast.success("Saved.");
    },
    onError: (e) => toast.error("Save failed: " + e.message),
  });
};

export const useDeleteLandingCourse = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("landing_courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing_courses"] });
      toast.success("Deleted.");
    },
    onError: (e) => toast.error("Delete failed: " + e.message),
  });
};

export async function importLandingCourseImageFromUrl(url: string): Promise<string> {
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
