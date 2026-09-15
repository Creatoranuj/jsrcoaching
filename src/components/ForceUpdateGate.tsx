import { useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { isUpdateRequired } from "@/utils/version";
import { loadCapacitorApp } from "@/lib/native/app";
import { openResource } from "@/lib/openResource";


interface AppConfigRow {
  min_android_version: string;
  min_ios_version: string;
  android_store_url: string | null;
  ios_store_url: string | null;
  update_message: string;
}

const LS_KEY = "nb:app_config:v1";
const LS_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

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

export const ForceUpdateGate = ({ children }: { children: ReactNode }) => {
  const [blocked, setBlocked] = useState(false);
  const [config, setConfig] = useState<AppConfigRow | null>(null);
  // null = not yet loaded. We MUST NOT evaluate the version gate until this
  // resolves, otherwise the dialog flashes for one frame on cold start.
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);

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
          "min_android_version,min_ios_version,android_store_url,ios_store_url,update_message"
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

  // Evaluate block whenever cfg or version changes.
  useEffect(() => {
    if (!isNative) return;
    if (currentVersion === null) return; // wait for real version
    const cfg = fetchedCfg;
    if (!cfg) return; // fail open
    try {
      const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : "android";
      const min = platform === "ios" ? cfg.min_ios_version : cfg.min_android_version;
      if (isUpdateRequired(currentVersion, min)) {
        setConfig(cfg);
        setBlocked(true);
      } else {
        setBlocked(false);
      }
    } catch (err) {
      console.warn("[ForceUpdateGate] Version check failed, failing open:", err);
    }
  }, [fetchedCfg, currentVersion, isNative]);

  const openStore = async () => {
    const { Capacitor } = await import("@capacitor/core").catch(() => ({ Capacitor: null as any }));
    const platform = Capacitor?.getPlatform?.() ?? (/iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : "android");
    const url =
      platform === "ios"
        ? config?.ios_store_url
        : config?.android_store_url;
    // Scheme allowlist — store URLs live in DB and must never be javascript:/data:.
    if (typeof url === "string" && url.startsWith("https://")) {
      void openResource({ url, kind: "link" });
    } else {
      console.warn("[ForceUpdateGate] Blocked non-https store URL:", url);
    }
  };

  return (
    <>
      {children}
      <Dialog open={blocked}>
        <DialogContent
          className="max-w-sm sm:max-w-md [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <AlertTriangle className="w-6 h-6 text-destructive" />
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
    </>
  );
};

export default ForceUpdateGate;