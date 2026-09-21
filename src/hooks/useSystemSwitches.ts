import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { loadSiteSettingRows } from "@/lib/siteSettingsCache";
import {
  ALL_SWITCH_KEYS,
  isEdgeFunctionOn,
  isFeatureOn,
  parseSwitchRows,
  type FeatureSwitch,
} from "@/lib/systemSwitches";
import { isDegraded, subscribeServiceHealth } from "@/lib/serviceHealth";

/**
 * Survival Mode switches padhne ka hook.
 *
 * Wahi cached `site_settings` read jo baaki flags use karte hain — koi nayi
 * query nahi. Read fail ho jaye ya key missing ho, to sab kuch ON (aaj jaisa).
 */
export const SYSTEM_SWITCHES_QUERY_KEY = ["site_settings", "system_switches"] as const;

export type SystemSwitches = {
  switches: Record<string, boolean>;
  isLoading: boolean;
  /** Student-facing feature ON hai? */
  feature: (name: FeatureSwitch) => boolean;
  /** Edge function ON hai? */
  edgeFunction: (name: string) => boolean;
  /** Device khud halke mode me hai (baar-baar server fail hone par)? */
  degraded: boolean;
};

export function useSystemSwitches(): SystemSwitches {
  const { data, isLoading } = useQuery({
    queryKey: SYSTEM_SWITCHES_QUERY_KEY,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => parseSwitchRows(await loadSiteSettingRows(ALL_SWITCH_KEYS)),
  });

  const [degraded, setDegraded] = useState<boolean>(() => isDegraded());
  useEffect(() => subscribeServiceHealth(setDegraded), []);

  const switches = data ?? {};

  const feature = useCallback(
    (name: FeatureSwitch) => isFeatureOn(name, switches),
    [data], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const edgeFunction = useCallback(
    (name: string) => isEdgeFunctionOn(name, switches),
    [data], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { switches, isLoading, feature, edgeFunction, degraded };
}

/** Sirf ek feature check karna ho to. */
export function useFeatureSwitch(name: FeatureSwitch): boolean {
  const { feature } = useSystemSwitches();
  return feature(name);
}
