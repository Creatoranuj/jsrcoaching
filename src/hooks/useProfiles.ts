import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/errorMessage";

export interface Profile {
  id: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  role?: string | null; // from user_roles via RPC, NOT from profiles table
  createdAt: string | null;
}

export interface ProfileInput {
  fullName?: string;
  email?: string;
  mobile?: string;
}

const PROFILE_STALE_MS = 5 * 60 * 1000; // 5 min — perf cache to cut redundant profile reads
const PROFILE_GC_MS = 30 * 60 * 1000;

async function fetchProfileRow(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,email,mobile,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    mobile: data.mobile,
    createdAt: data.created_at,
  };
}

export const useProfiles = () => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Cached per-user profile — shared across ALL components via React Query.
  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfileRow(user!.id),
    enabled: !!user?.id,
    staleTime: PROFILE_STALE_MS,
    gcTime: PROFILE_GC_MS,
  });

  const fetchProfile = useCallback(async () => {
    if (!user?.id) return;
    await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
  }, [user?.id, queryClient]);

  const fetchAllProfiles = useCallback(async (): Promise<Profile[]> => {
    if (!isAdmin) return [];
    try {
      const { data, error: dbError } = await supabase.rpc("get_user_profiles_admin");
      if (dbError) throw dbError;
      return (data || []).map((p) => ({
        id: p.id,
        fullName: p.full_name,
        email: p.email,
        mobile: p.mobile,
        role: p.role,
        createdAt: p.created_at,
      }));
    } catch (err: unknown) {
      logger.error("Error fetching all profiles:", err);
      return [];
    }
  }, [isAdmin]);

  const updateProfile = useCallback(
    async (input: ProfileInput): Promise<boolean> => {
      if (!user) {
        toast.error("Pehle login karo");
        return false;
      }
      try {
        const updateData: { full_name?: string; email?: string; mobile?: string } = {};
        if (input.fullName !== undefined) updateData.full_name = input.fullName;
        if (input.email !== undefined) updateData.email = input.email;
        if (input.mobile !== undefined) updateData.mobile = input.mobile;

        const { error: dbError } = await supabase
          .from("profiles")
          .update(updateData)
          .eq("id", user.id);
        if (dbError) throw dbError;

        toast.success("Profile updated");
        await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
        return true;
      } catch (err: unknown) {
        logger.error("Error updating profile:", err);
        toast.error("Profile update nahi hui — dobara try karo");
        return false;
      }
    },
    [user, queryClient]
  );

  const createProfile = useCallback(async (_userId: string, _fullName: string): Promise<boolean> => {
    return true;
  }, []);

  return {
    profile: profileQuery.data ?? null,
    profiles: [] as Profile[], // legacy field — admin lists should call fetchAllProfiles()
    loading: profileQuery.isLoading,
    error: profileQuery.error ? (profileQuery.error as Error).message : null,
    fetchProfile,
    fetchAllProfiles,
    updateProfile,
    createProfile,
  };
};
