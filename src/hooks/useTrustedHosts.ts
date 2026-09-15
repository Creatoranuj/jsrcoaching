import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TrustedHostCategory =
  | "frame"
  | "image"
  | "media"
  | "website"
  | "script"
  | "connect";

export interface TrustedHost {
  id: string;
  host: string;
  category: TrustedHostCategory;
  label: string | null;
  notes: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Reads the admin-managed `trusted_hosts` table. Used by the admin panel
 * (CRUD) and by app-level iframe/link guards (`isHostTrusted`).
 *
 * Note: index.html CSP is permissive (https:) so any HTTPS host *will* load
 * in an iframe — this table is the soft allowlist enforced at app level for
 * security UX, plus a single place where admins manage what hosts the app
 * is "officially" trusting.
 */
export function useTrustedHosts(category?: TrustedHostCategory) {
  const [hosts, setHosts] = useState<TrustedHost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("trusted_hosts")
      .select("*")
      .order("category", { ascending: true })
      .order("host", { ascending: true });
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (!error && data) setHosts(data as unknown as TrustedHost[]);
    setLoading(false);
  }, [category]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("trusted_hosts")
        .select("*")
        .order("category", { ascending: true })
        .order("host", { ascending: true });
      if (category) q = q.eq("category", category);
      const { data, error } = await q;
      if (cancelled) return;
      if (!error && data) setHosts(data as unknown as TrustedHost[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetch, category]);

  return { hosts, loading, refetch: fetch };
}

/** Quick check whether a URL is in the admin-managed allowlist. */
export function isHostTrusted(
  url: string,
  hosts: TrustedHost[],
  category?: TrustedHostCategory
): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return hosts.some(
      (t) =>
        t.enabled &&
        (!category || t.category === category) &&
        (h === t.host.toLowerCase() ||
          h.endsWith("." + t.host.toLowerCase().replace(/^\*\./, "")))
    );
  } catch {
    return false;
  }
}
