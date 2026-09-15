import { QueryClient } from "@tanstack/react-query";

// Shared React Query singleton — imported by App.tsx (provider) AND by
// non-hook modules (AuthContext) that need to seed the cache so `useProfiles`
// consumers don't re-fetch the same self-profile row on every mount.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: (failureCount, error: unknown) => {
        const status =
          (error as { status?: number; statusCode?: number })?.status ??
          (error as { statusCode?: number })?.statusCode;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: "offlineFirst",
      retry: 1,
    },
  },
});

export const SELF_PROFILE_KEY = (userId: string) => ["profile", userId] as const;