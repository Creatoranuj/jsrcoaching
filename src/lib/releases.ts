import { supabase } from "@/integrations/supabase/client";

export type ReleaseStatus = "supported" | "deprecated" | "forced_update";

export interface AppRelease {
  id: string;
  version: string;
  version_code: number | null;
  title: string;
  notes: string;
  status: ReleaseStatus;
  is_current: boolean;
  released_at: string;
}

const RELEASE_COLUMNS =
  "id,version,version_code,title,notes,status,is_current,released_at";

/** Newest first. Never throws — callers render what they have. */
export async function fetchReleases(): Promise<AppRelease[]> {
  const { data, error } = await supabase
    .from("app_releases")
    .select(RELEASE_COLUMNS)
    .order("released_at", { ascending: false })
    .order("created_at" as never, { ascending: false });
  if (error) throw error;
  return (data as unknown as AppRelease[]) ?? [];
}

export async function fetchCurrentRelease(): Promise<AppRelease | null> {
  const { data, error } = await supabase
    .from("app_releases")
    .select(RELEASE_COLUMNS)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AppRelease) ?? null;
}

export interface InstalledVersionState {
  /** true when the installed version has a row in the release history. */
  known: boolean;
  status: ReleaseStatus | null;
  release: AppRelease | null;
}

/**
 * Pure lookup used by ForceUpdateGate: what does the release history say
 * about the version this device is running?
 */
export function getInstalledVersionState(
  installedVersion: string | null | undefined,
  releases: AppRelease[] | null | undefined,
): InstalledVersionState {
  if (!installedVersion || !releases || releases.length === 0) {
    return { known: false, status: null, release: null };
  }
  const normalized = installedVersion.trim().replace(/^v/i, "");
  const match =
    releases.find((r) => r.version === normalized) ??
    releases.find((r) => r.version.replace(/^v/i, "") === normalized) ??
    null;
  if (!match) return { known: false, status: null, release: null };
  return { known: true, status: match.status, release: match };
}

/**
 * The newest version marked current, used as a fallback "latest" when
 * app_config has not been published yet.
 */
export function getCurrentReleaseVersion(
  releases: AppRelease[] | null | undefined,
): string | null {
  if (!releases) return null;
  return releases.find((r) => r.is_current)?.version ?? null;
}
