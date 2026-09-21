import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, LifeBuoy, RotateCcw, Server, ToggleLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { resetSiteSettingsCache } from "@/lib/siteSettingsCache";
import { getErrorMessage } from "@/lib/errorMessage";
import { SYSTEM_SWITCHES_QUERY_KEY } from "@/hooks/useSystemSwitches";
import {
  ALL_SWITCH_KEYS,
  EDGE_FUNCTION_SWITCHES,
  FEATURE_LABELS,
  FEATURE_SWITCHES,
  LEGACY_ALIASES,
  PROTECTED_KEYS,
  SURVIVAL_MODE_OFF_KEYS,
  edgeSwitchKey,
  isProtected,
  parseSwitchRows,
  type FeatureSwitch,
} from "@/lib/systemSwitches";

/**
 * Survival Mode control panel.
 *
 * Har chip ek switch hai — tap karo, ON/OFF ho jata hai, turant students par
 * lagu. "Survival Mode" button ek hi baar me saari bhaari cheezein band karta
 * hai. Protected list sirf dikhane ke liye hai — wo band ho hi nahi sakti.
 */
export default function SystemSwitchManager() {
  const queryClient = useQueryClient();
  const [switches, setSwitches] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("site_settings")
          .select("key, value")
          .in("key", [...ALL_SWITCH_KEYS]);
        if (cancelled) return;
        if (error) throw error;
        setSwitches(parseSwitchRows(data || []));
      } catch (err: unknown) {
        toast.error("Switches load nahi ho paye: " + getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isOn = (key: string): boolean => switches[key] !== false;

  const afterWrite = () => {
    resetSiteSettingsCache();
    queryClient.invalidateQueries({ queryKey: SYSTEM_SWITCHES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["site_settings"] });
  };

  const writeKeys = async (updates: { key: string; value: boolean }[]) => {
    const rows = updates.map((u) => ({
      key: u.key,
      value: String(u.value),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("site_settings").upsert(rows, { onConflict: "key" });
    if (error) throw error;
  };

  const toggle = async (
    key: string,
    label: string,
    guardName: string,
    alsoWrite: string[] = [],
  ) => {
    if (isProtected(guardName)) {
      toast.info(`${label} band nahi ho sakta — ye hamesha chalu rahega.`);
      return;
    }
    const next = !isOn(key);
    setSaving(key);
    setSwitches((prev) => ({ ...prev, [key]: next }));
    try {
      await writeKeys([key, ...alsoWrite].map((k) => ({ key: k, value: next })));
      afterWrite();
      toast.success(`${label} ${next ? "ON" : "OFF"} — abhi se lagu.`, { id: key });
    } catch (err: unknown) {
      setSwitches((prev) => ({ ...prev, [key]: !next }));
      toast.error("Save nahi hua: " + getErrorMessage(err), { id: key });
    } finally {
      setSaving(null);
    }
  };

  const setSurvivalMode = async (on: boolean) => {
    setBulkBusy(true);
    try {
      const keys = on ? [...SURVIVAL_MODE_OFF_KEYS] : [...ALL_SWITCH_KEYS];
      await writeKeys(keys.map((key) => ({ key, value: !on })));
      setSwitches((prev) => {
        const next = { ...prev };
        keys.forEach((k) => {
          next[k] = !on;
        });
        return next;
      });
      afterWrite();
      toast.success(
        on
          ? "Survival Mode ON — sirf padhai wali cheezein chal rahi hain."
          : "Sab kuch wapas normal — saare switches ON.",
        { id: "survival-mode" },
      );
    } catch (err: unknown) {
      toast.error("Nahi ho paya: " + getErrorMessage(err), { id: "survival-mode" });
    } finally {
      setBulkBusy(false);
    }
  };

  const survivalActive = useMemo(
    () => SURVIVAL_MODE_OFF_KEYS.every((k) => switches[k] === false),
    [switches],
  );

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Switches load ho rahe hain…</div>;
  }

  const featureKeys = Object.keys(FEATURE_SWITCHES) as FeatureSwitch[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="h-4 w-4" />
            Survival Mode
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Emergency me ek tap: AI, search, community, notifications aur baaki bhaari cheezein
            band. Login, My Courses, chapter, lesson, PDF, video aur payment waise hi chalte
            rahenge.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            variant={survivalActive ? "secondary" : "destructive"}
            disabled={bulkBusy}
            onClick={() => void setSurvivalMode(true)}
            className="gap-2"
          >
            <LifeBuoy className="h-4 w-4" />
            {survivalActive ? "Survival Mode chalu hai" : "Survival Mode ON karo"}
          </Button>
          <Button
            variant="outline"
            disabled={bulkBusy}
            onClick={() => void setSurvivalMode(false)}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Sab normal karo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ToggleLeft className="h-4 w-4" />
            Features ({featureKeys.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Chip par tap karke ON/OFF karo. Green = chalu, grey = band.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {featureKeys.map((feature) => {
            const key = FEATURE_SWITCHES[feature];
            const on = isOn(key);
            return (
              <button
                key={key}
                type="button"
                disabled={saving === key || bulkBusy}
                onClick={() =>
                  void toggle(key, FEATURE_LABELS[feature], feature, LEGACY_ALIASES[feature] ?? [])
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  on
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {FEATURE_LABELS[feature]} · {on ? "ON" : "OFF"}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4" />
            Server functions ({EDGE_FUNCTION_SWITCHES.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            OFF karne par wo function server par bhi chalna band kar dega (503 "abhi band hai"),
            sirf UI me nahi.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {EDGE_FUNCTION_SWITCHES.map((fn) => {
            const key = edgeSwitchKey(fn);
            const on = isOn(key);
            return (
              <button
                key={key}
                type="button"
                disabled={saving === key || bulkBusy}
                onClick={() => void toggle(key, fn, fn)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  on
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {fn} · {on ? "ON" : "OFF"}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Hamesha chalu (protected)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ye list code me fix hai. Database me galti se OFF likh bhi diya jaye, to bhi app inhe
            ON hi maanega.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {PROTECTED_KEYS.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1 text-[11px]">
              <Lock className="h-3 w-3" />
              {name}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
