import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { toast } from "sonner";

export interface Testimonial {
  id: string;
  student_name: string;
  exam_track: string | null;
  quote: string;
  avatar_url: string | null;
  rating: number;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TestimonialInsert = Omit<Testimonial, "id" | "created_at" | "updated_at">;

export const useTestimonials = (examTrack?: string) =>
  useQuery({
    queryKey: ["landing_testimonials", "active", examTrack ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("landing_testimonials")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (examTrack) q = q.eq("exam_track", examTrack);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Testimonial[]) || [];
    },
    staleTime: 1000 * 60 * 10,
  });

export const useAllTestimonials = () =>
  useQuery({
    queryKey: ["landing_testimonials", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landing_testimonials")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data as unknown as Testimonial[]) || [];
    },
  });

export const useCreateTestimonial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: TestimonialInsert) => {
      const { data, error } = await supabase
        .from("landing_testimonials")
        .insert(row as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Testimonial;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing_testimonials"] });
      toast.success("Testimonial added");
    },
    onError: () => toast.error("Add nahi hua — dobara try karo"),
  });
};

export const useUpdateTestimonial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Testimonial> & { id: string }) => {
      const { error } = await supabase
        .from("landing_testimonials")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing_testimonials"] });
      toast.success("Saved");
    },
    onError: () => toast.error("Save nahi hua — dobara try karo"),
  });
};

export const useDeleteTestimonial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("landing_testimonials")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing_testimonials"] });
      toast.success("Deleted");
    },
    onError: () => toast.error("Delete nahi hua — dobara try karo"),
  });
};
