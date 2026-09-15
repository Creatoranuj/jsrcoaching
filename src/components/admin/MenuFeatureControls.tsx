import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@/lib/errorMessage";
import {
  MENU_FEATURE_KEYS,
  MENU_FEATURE_DEFAULTS,
  MENU_FEATURE_QUERY_KEY,
  parseMenuFeatureRows,
  type MenuFeatureFlag,
  type MenuFeatureFlags,
} from "@/hooks/useMenuFeatureFlags";

const ITEMS: { key: MenuFeatureFlag; label: string; description: string }[] = [
  { key: "doubts", label: "Doubt Sessions", description: "Side menu ka Doubt Sessions item aur /doubts page." },
  { key: "community", label: "Community", description: "Side menu ka Community item aur /community page." },
  { key: "reports", label: "Reports", description: "Side menu ka Reports item aur /reports page." },
  { key: "messages", label: "Messages", description: "Side menu ka Messages item aur /messages page." },
];

export default function MenuFeatureControlsManager() {
  const queryClient = useQueryClient();
  const [flags, setFlags] = useState<MenuFeatureFlags>(MENU_FEATURE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<MenuFeatureFlag | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("site_settings")
          .select("key, value")
          .in("key", Object.values(MENU_FEATURE_KEYS));
        if (cancelled) return;
        if (error) throw error;
        setFlags(parseMenuFeatureRows(data || []));
      } catch (err: unknown) {
        toast.error("Failed to load side menu controls: " + getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (flag: MenuFeatureFlag, label: string) => {
    const next = !flags[flag];
    setSaving(flag);
    try {
      const { error } = await supabase.from("site_settings").upsert(
        {
          key: MENU_FEATURE_KEYS[flag],
          value: String(next),
          
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;

      setFlags((prev) => ({ ...prev, [flag]: next }));
      queryClient.invalidateQueries({ queryKey: MENU_FEATURE_QUERY_KEY });
      toast.success(`${label} ${next ? "ON" : "OFF"} — students ke liye lagu ho gaya.`, {
        id: `menu-flag-${flag}`,
      });
    } catch (err: unknown) {
      toast.error("Save failed: " + getErrorMessage(err), { id: `menu-flag-${flag}` });
      setFlags((prev) => ({ ...prev, [flag]: !next }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading side menu controls…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Menu className="h-4 w-4" />
          Side Menu
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          OFF karne par item students ke side menu se hat jayega. Admin aur teacher ko dikhta rahega.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {ITEMS.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor={`menu-${item.key}`} className="text-sm font-medium">
                {item.label}
              </Label>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Switch
              id={`menu-${item.key}`}
              checked={flags[item.key]}
              disabled={saving === item.key}
              onCheckedChange={() => void toggle(item.key, item.label)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
