import { useEffect, useState, ReactNode, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { JSRMark } from "@/components/brand/JSRMark";
import { isUpdateRequired, isUpdateAvailable } from "@/utils/version";
import { loadCapacitorApp } from "@/lib/native/app";
import { openResource } from "@/lib/openResource";
import { isAllowedUpdateUrl, isStoreListingUrl } from "@/utils/downloadUrl";
import { UPDATE_PAGE_URL } from "@/config/updatePage";
import { openInSystemBrowser } from "@/lib/native/browser";
import { fetchLatestReleaseVersion } from "@/utils/latestRelease";
import { fetchReleases, getCurrentReleaseVersion, getInstalledVersionState, type AppRelease } from "@/lib/releases";
import { logger } from "@/lib/logger";

interface AppConfigRow {
  min_android_version: string;
  min_ios_version: string;
  latest_android_version: string;
  latest_ios_version: string;
  android_store_url: string | null;
  ios_store_url: string | null;
  update_message: string;
  update_notes: string | null;
  force_update: boolean;
}

const LS_KEY = "nb:app_config:v2";
const LS_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h
/** Optional-update snooze, scoped per target version so a new release re-asks. */
const SNOOZE_PREFIX = "nb:update_snooze:";
const SNOOZE_MS = 1000 * 60 * 60 * 24; // 24h

/** none = up to date, optional = dismissible nudge, required = hard block. */
type UpdateMode = "none" | "optional" | "required";

const isNativePlatform = async () => {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const readCachedConfig = (): AppConfigRow | null => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: AppConfigRow };
    if (!parsed?.data || Date.now() - parsed.ts > LS_MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
};

const writeCachedConfig = (data: AppConfigRow) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* ignore quota errors */
  }
};

const isSnoozed = (version: string): boolean => {
  try {
    const raw = localStorage.getItem(SNOOZE_PREFIX + version);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < SNOOZE_MS;
  } catch {
    return false;
  }
};

const snooze = (version: string) => {
  try {
    localStorage.setItem(SNOOZE_PREFIX + version, String(Date.now()));
  } catch {
    /* ignore quota errors */
  }
};

export const ForceUpdateGate = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<UpdateMode>("none");
  const [config, setConfig] = useState<AppConfigRow | null>(null);
  const [targetVersion, setTargetVersion] = useState<string>("");
  // null = not yet loaded. We MUST NOT evaluate the version gate until this
  // resolves, otherwise the dialog flashes for one frame on cold start.
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);
  const queryClient = useQueryClient();

  // A student who keeps the app in the background for days would otherwise sit
  // on a 1-hour-stale config and never see a new release. Re-check on resume so
  // a freshly published version shows its prompt within seconds of reopening.
  useEffect(() => {
    if (!isNative) return;
    const onResumed = () => {
      void queryClient.invalidateQueries({ queryKey: ["app_config"] });
    };
    window.addEventListener("app:resumed", onResumed);
    return () => window.removeEventListener("app:resumed", onResumed);
  }, [isNative, queryClient]);


  useEffect(() => {
    let cancelled = false;
    isNativePlatform().then((native) => {
      if (!cancelled) setIsNative(native);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read app version once on mount (native only).
  useEffect(() => {
    if (!isNative) return;
    // Static import — capacitorApp is already in the main chunk via other
    // hooks; dynamic import here produced Rolldown INEFFECTIVE_DYNAMIC_IMPORT.
    loadCapacitorApp()
      .then(({ plugin: App }) => App.getInfo())
      .then((info) => setCurrentVersion(info.version || "0.0.0"))
      .catch(() => setCurrentVersion("0.0.0"));
  }, [isNative]);

  // Fetch + cache app_config via React Query (1h staleTime, 24h gc).
  const { data: fetchedCfg } = useQuery<AppConfigRow | null>({
    queryKey: ["app_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select(
          "min_android_version,min_ios_version,latest_android_version,latest_ios_version,android_store_url,ios_store_url,update_message,update_notes,force_update"
        )
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (data) writeCachedConfig(data as AppConfigRow);
      return (data as AppConfigRow) ?? null;
    },
    enabled: isNative,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    initialData: () => readCachedConfig(),
    retry: 1,
  });

  // Safety net: if CI could not publish the new version into app_config, the
  // column goes stale and nobody gets nudged. GitHub's public "latest release"
  // is the same fact from the source of truth, so we use it for the SOFT nudge
  // only — a forced update still comes from the database.
  const { data: releaseVersion } = useQuery<string | null>({
    queryKey: ["latest_release_version"],
    queryFn: () => fetchLatestReleaseVersion(),
    enabled: isNative,
    staleTime: 1000 * 60 * 60 * 6, // 6 hours
    gcTime: 1000 * 60 * 60 * 24,
    retry: 0,
  });

  // Release history override: an admin can retire the installed build in
  // app_releases (status forced_update) without republishing app_config.
  // Fails open — if the table is missing or empty, nothing changes.
  const { data: releases } = useQuery<AppRelease[]>({
    queryKey: ["app_releases_gate"],
    queryFn: fetchReleases,
    enabled: isNative,
    staleTime: 1000 * 60 * 5, // 5 minutes — forced_update must reach devices fast
    gcTime: 1000 * 60 * 60 * 24,
    retry: 0,
  });

  // Evaluate the gate whenever cfg or version changes.
  useEffect(() => {
    if (!isNative) return;
    if (currentVersion === null) return; // wait for real version
    const cfg = fetchedCfg;
    if (!cfg) return; // fail open
    try {
      const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : "android";
      const min = platform === "ios" ? cfg.min_ios_version : cfg.min_android_version;
      const published = platform === "ios" ? cfg.latest_ios_version : cfg.latest_android_version;
      // Prefer whichever is actually newer than the installed build.
      const latest =
        platform === "android" && releaseVersion && isUpdateAvailable(published || "0.0.0", releaseVersion)
          ? releaseVersion
          : published;

      setConfig(cfg);
      // app_config.latest_* goes stale when CI didn't republish it; the
      // release marked current in app_releases is the fresher fallback.
      const latestFromReleases = getCurrentReleaseVersion(releases);
      const effectiveLatest =
        latestFromReleases && isUpdateAvailable(latest || "0.0.0", latestFromReleases)
          ? latestFromReleases
          : latest;
      setTargetVersion(effectiveLatest || min || "");

      // Release history says this installed build is retired outright.
      const installed = getInstalledVersionState(currentVersion, releases);
      if (installed.status === "forced_update") {
        setMode("required");
        return;
      }

      // Hard block: below the minimum supported build, or the admin flipped
      // force_update on while a newer build exists.
      if (isUpdateRequired(currentVersion, min) || (cfg.force_update && isUpdateAvailable(currentVersion, effectiveLatest))) {
        setMode("required");
        return;
      }
      // Soft nudge: a newer build exists and the user has not snoozed it.
      if (isUpdateAvailable(currentVersion, effectiveLatest) && !isSnoozed(effectiveLatest)) {
        setMode("optional");
        return;
      }
      setMode("none");
    } catch (err) {
      // Never let a version-check bug lock students out of the app.
      logger.warn("[ForceUpdateGate] version check failed, failing open", err);
      setMode("none");
    }
  }, [fetchedCfg, currentVersion, isNative, releaseVersion, releases]);

  const openStore = useCallback(async () => {
    const { Capacitor } = await import("@capacitor/core").catch(() => ({
      Capacitor: null as typeof import("@capacitor/core").Capacitor | null,
    }));
    const platform = Capacitor?.getPlatform?.() ?? (/iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : "android");
    const configured = platform === "ios" ? config?.ios_store_url : config?.android_store_url;

    // A real store listing (admin override / iOS) is handled by the store app,
    // so keep the existing in-app open path for it.
    if (isStoreListingUrl(configured)) {
      void openResource({ url: configured, kind: "link" });
      return;
    }

    // Android sideload: an APK link CANNOT download inside an in-app WebView or
    // Custom Tab — the tap looks dead. Send the student to our public update
    // page in the phone's real browser, where download + install works.
    if (configured && !isAllowedUpdateUrl(configured)) {
      logger.warn("[ForceUpdateGate] configured url rejected, using update page", undefined, { configured });
    }
    void openInSystemBrowser(UPDATE_PAGE_URL);
  }, [config]);

  const dismissOptional = useCallback(() => {
    if (targetVersion) snooze(targetVersion);
    setMode("none");
  }, [targetVersion]);

  return (
    <>
      {children}

      {/* Mandatory update — no way out except updating. */}
      <Dialog open={mode === "required"}>
        <DialogContent
          className="max-w-sm sm:max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto mb-2 flex justify-center">
              <JSRMark compact />
            </div>
            <DialogTitle className="text-center">Update Required</DialogTitle>
            <DialogDescription className="text-center">
              {config?.update_message ||
                "A critical update is available. Please update to continue learning."}
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full" size="lg" onClick={openStore}>
            Update Now
          </Button>
        </DialogContent>
      </Dialog>

      {/* Optional update — dismissible, snoozed for 24h per version. */}
      <Dialog open={mode === "optional"} onOpenChange={(open) => { if (!open) dismissOptional(); }}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex justify-center">
              <JSRMark compact />
            </div>
            <DialogTitle className="text-center">
              Naya version {targetVersion ? `(${targetVersion})` : ""} aa gaya hai
            </DialogTitle>
            <DialogDescription className="text-center">
              {config?.update_notes ||
                "Nayi suvidhaen aur zaroori sudhaar. Behtar experience ke liye update karein."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button className="w-full" size="lg" onClick={openStore}>
              Update karein
            </Button>
            <Button className="w-full" variant="ghost" onClick={dismissOptional}>
              Baad me
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ForceUpdateGate;
