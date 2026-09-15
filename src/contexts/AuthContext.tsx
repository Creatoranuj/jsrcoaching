import { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { queryClient, SELF_PROFILE_KEY } from "../lib/queryClient";
import { checkPasswordStrength } from "../lib/passwordStrength";
import { leakedPasswordError } from "../lib/leakedPassword";

export type AppRole = "admin" | "student" | "teacher";

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  role: AppRole;
}

export interface UserProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  mobile: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  roleLoaded: boolean;
  isAdmin: boolean;
  isStudent: boolean;
  isTeacher: boolean;
  login: (email: string, password: string) => Promise<{ error: Error | null }>;
  signup: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  logout: () => Promise<void>;
  refetchUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Module-level singleton — tracks the user id we've already initialised push
// notifications for, so onAuthStateChange (which fires on every token refresh)
// doesn't stack a fresh FCM listener every ~1 hour. (Audit fix)
let pushInitedFor: string | null = null;

// Cache last-known role per user so cold-start / refresh doesn't flash the
// "student" default at admins/teachers before the get_user_role RPC returns.
// Server RLS + has_role() remain the source of truth; this is a UX hint only.
const ROLE_CACHE_PREFIX = "nb:last_role:";
function readCachedRole(userId: string): AppRole | null {
  try {
    const v = localStorage.getItem(ROLE_CACHE_PREFIX + userId);
    return v === "admin" || v === "teacher" || v === "student" ? v : null;
  } catch { return null; }
}
function writeCachedRole(userId: string, role: AppRole) {
  try { localStorage.setItem(ROLE_CACHE_PREFIX + userId, role); } catch { /* noop */ }
}
function clearAllCachedRoles() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(ROLE_CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* noop */ }
}

function makeDefaults(supabaseUser: SupabaseUser): { user: User; profile: UserProfile; role: AppRole } {
  const email = supabaseUser.email ?? "";
  const metaName = supabaseUser.user_metadata?.full_name ?? null;
  const cached = readCachedRole(supabaseUser.id) ?? "student";
  return {
    user: { id: supabaseUser.id, email, fullName: metaName, role: cached },
    profile: { id: supabaseUser.id, email, fullName: metaName, avatarUrl: null, mobile: null },
    role: cached,
  };
}

async function fetchUserData(
  supabaseUser: SupabaseUser
): Promise<{ user: User; profile: UserProfile; role: AppRole }> {
  const defaults = makeDefaults(supabaseUser);
  try {
    const [profileResult, roleResult] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, avatar_url, mobile").eq("id", supabaseUser.id).single().then(r => r, e => ({ data: null, error: e })),
      supabase.rpc("get_user_role", { _user_id: supabaseUser.id }).then(r => r, e => ({ data: null, error: e })),
    ]);

    const profileData = profileResult.data;
    // AUDIT (HIGH — AUTHZ/OBS): the has_role RPC can fail transiently
    // (offline cold-start, brief RLS blip, cold DB). Previously we silently
    // fell back to `"student"` — a legitimate admin/teacher would then be
    // dropped into the student UI with NO way to know why, and every
    // admin-only client gate would redirect them to `/login`. Not a
    // privilege-escalation (fails safe direction) but a real UX/OBS gap.
    // Now: on RPC error, report to Sentry AND fall back to defaults (which
    // set role="student" for the same reason) but surface the error path
    // so triage can see it in logs.
    let roleErr = (roleResult as { error?: unknown }).error;
    let roleData = roleResult.data;
    // Expired JWT (PGRST303) is a session lifecycle event, not an RPC bug:
    // refresh once and retry so admins/teachers don't get downgraded to the
    // student UI after a long background.
    if (roleErr && /PGRST30[13]|jwt expired|42501/i.test(JSON.stringify(roleErr))) {
      try {
        const { data: refreshed } = await supabase.auth.refreshSession();
        if (refreshed?.session) {
          const retry = await supabase.rpc("get_user_role", { _user_id: supabaseUser.id });
          roleErr = retry.error ?? undefined;
          roleData = retry.data;
        }
      } catch { /* fall through to defaults */ }
    }
    if (roleErr) {
      try {
        const { reportError } = await import("@/lib/sentry");
        reportError(roleErr, { where: "AuthContext.fetchUserData", op: "get_user_role" });
      } catch { /* noop */ }
    }
    const role: AppRole = (roleData as AppRole) ?? "student";
    // Persist so the next cold-start seeds the correct role synchronously.
    writeCachedRole(supabaseUser.id, role);
    const fullName = profileData?.full_name ?? supabaseUser.user_metadata?.full_name ?? null;
    const email = profileData?.email ?? supabaseUser.email ?? "";

    // Seed the shared React Query cache so `useProfiles()` consumers across
    // the app read from cache instead of firing another `profiles` self-lookup
    // (was #2 slow_queries offender at ~4.5k calls/user/day).
    if (profileData) {
      queryClient.setQueryData(SELF_PROFILE_KEY(supabaseUser.id), {
        id: profileData.id,
        fullName: profileData.full_name,
        email: profileData.email,
        mobile: profileData.mobile,
        createdAt: null,
      });
    }

    return {
      user: { id: supabaseUser.id, email, fullName, role },
      profile: { id: supabaseUser.id, email, fullName, avatarUrl: profileData?.avatar_url ?? null, mobile: profileData?.mobile ?? null },
      role,
    };
  } catch (err) {
    // Route to Sentry instead of a silent console.warn — this branch swallows
    // ALL profile+role failures and was invisible in production.
    try {
      const { reportError } = await import("@/lib/sentry");
      reportError(err, { where: "AuthContext.fetchUserData", op: "outer_catch" });
    } catch { /* noop */ }
    console.warn("[AuthContext] fetchUserData error:", err);
    return defaults;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);
  const loadCounter = useRef(0);

  const applyUser = useCallback((data: { user: User; profile: UserProfile; role: AppRole } | null) => {
    if (!isMounted.current) return;
    if (data) {
      setUser(data.user);
      setProfile(data.profile);
      setRole(data.role);
    } else {
      setUser(null);
      setProfile(null);
      setRole(null);
    }
  }, []);

  const loadUser = useCallback((supabaseUser: SupabaseUser) => {
    const thisLoad = ++loadCounter.current;
    // Fire-and-forget — NEVER await inside onAuthStateChange
    fetchUserData(supabaseUser).then((data) => {
      if (isMounted.current && thisLoad === loadCounter.current) {
        applyUser(data);
        setRoleLoaded(true);
      }
    }).catch(() => {
      if (isMounted.current && thisLoad === loadCounter.current) {
        applyUser(makeDefaults(supabaseUser));
        setRoleLoaded(true);
      }
    });
    // Register push token for this user (native only, no-op on web).
    // Audit fix: guard against re-init on every auth event / token refresh —
    // re-initialising stacks FCM listeners and leaks memory over a session.
    if (pushInitedFor !== supabaseUser.id) {
      pushInitedFor = supabaseUser.id;
      import("@/lib/native/push")
        .then((m) => m.initPushNotifications(supabaseUser.id))
        .catch(() => { pushInitedFor = null; /* allow retry */ });
    }
  }, [applyUser]);

  useEffect(() => {
    isMounted.current = true;

    // Bandwidth: dedupe profile+role fetch across token refreshes.
    // onAuthStateChange fires on every TOKEN_REFRESHED (~1h) — previously
    // that re-ran the profile query, contributing to the #2 slow_queries
    // offender (~4.5k calls/user/day). Only re-enrich on SIGNED_IN /
    // USER_UPDATED, not on plain token refresh for the same user.
    let enrichedFor: string | null = null;

    // 1. Set up listener FIRST (per Supabase best practice)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        // Set defaults synchronously for instant UI, then enrich in background
        const defaults = makeDefaults(session.user);
        applyUser(defaults);
        const needsEnrich =
          enrichedFor !== session.user.id ||
          event === "SIGNED_IN" ||
          event === "USER_UPDATED";
        if (needsEnrich) {
          enrichedFor = session.user.id;
          loadUser(session.user); // fire-and-forget
        }
        // Track session in user_sessions (best-effort, non-blocking)
        import("@/lib/native/sessionTracker")
          .then((m) => m.startSessionTracking(session.user.id))
          .catch(() => { /* noop */ });
      } else {
        enrichedFor = null;
        applyUser(null);
        setRoleLoaded(false);
        if (event === "SIGNED_OUT") {
          clearAllCachedRoles();
          import("@/lib/native/sessionTracker")
            .then((m) => m.stopSessionTracking())
            .catch(() => { /* noop */ });
        }
      }
    });

    // 2. Then get current session — sets isLoading=false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted.current) {
        if (session?.user) {
          const defaults = makeDefaults(session.user);
          applyUser(defaults);
          if (enrichedFor !== session.user.id) {
            enrichedFor = session.user.id;
            loadUser(session.user); // fire-and-forget enrichment
          }
          import("@/lib/native/sessionTracker")
            .then((m) => m.startSessionTracking(session.user.id))
            .catch(() => { /* noop */ });
        }
        setIsLoading(false);
      }
    }).catch(() => {
      if (isMounted.current) setIsLoading(false);
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, [loadUser, applyUser]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { error };
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      const check = checkPasswordStrength(password);
      if (check.errors.length > 0) {
        return { error: new Error(check.errors[0]) };
      }
      const breached = await leakedPasswordError(password);
      if (breached) {
        return { error: new Error(breached) };
      }
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName },
        },
      });
      if (error) return { error };
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    if (isMounted.current) applyUser(null);
  }, [applyUser]);

  const refetchUserData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const data = await fetchUserData(session.user);
      applyUser(data);
    }
  }, [applyUser]);

  // CRITICAL: memoize the context value. Without this, a new object is
  // created every render and every `useAuth()` consumer (40+ pages, 80+
  // components) re-renders unnecessarily. On low-RAM Android this stacks
  // up into long tasks → input freeze.
  const value = useMemo(
    () => ({
      user,
      profile,
      role,
      isAuthenticated: !!user,
      isLoading,
      roleLoaded,
      isAdmin: role === "admin",
      isStudent: role === "student",
      isTeacher: role === "teacher",
      login,
      signup,
      logout,
      refetchUserData,
    }),
    [user, profile, role, isLoading, roleLoaded, login, signup, logout, refetchUserData]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
