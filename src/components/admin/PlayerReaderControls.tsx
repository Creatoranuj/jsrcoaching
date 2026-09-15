import { useEffect, useState } from "react";
import { MonitorPlay } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@/lib/errorMessage";
import {
  PLAYER_READER_KEYS,
  PLAYER_READER_DEFAULTS,
  PLAYER_READER_QUERY_KEY,
  parsePlayerReaderRows,
  type PlayerReaderFlags,
} from "@/hooks/usePlayerReaderControls";

const FLAGS: { key: keyof PlayerReaderFlags; label: string; description: string }[] = [
  {
    key: "infinityLogo",
    label: "Infinity chip logo (bottom-left)",
    description: 'Bird logo jo YouTube ke "More videos" / ∞ chip ko dhakta hai.',
  },
  {
    key: "youtubeMask",
    label: "YouTube label mask (bottom-right)",
    description: '"BHARAT" brand strip jo YouTube ka white watermark dhakta hai.',
  },
  {
    key: "readerZoom",
    label: "PDF zoom controls (− / % / +)",
    description: "OFF rahe to PDF reader 100% par khulta hai aur zoom sirf pinch se kaam karega.",
  },
];

export default function PlayerReaderControlsManager() {
  const queryClient = useQueryClient();
  const [flags, setFlags] = useState<PlayerReaderFlags>(PLAYER_READER_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof PlayerReaderFlags | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchFlags = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("site_settings")
          .select("key, value")
          .in("key", Object.values(PLAYER_READER_KEYS));
        if (cancelled) return;
        if (error) throw error;
        setFlags(parsePlayerReaderRows(data || []));
      } catch (err: unknown) {
        toast.error("Failed to load player & reader controls: " + getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchFlags();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (flag: keyof PlayerReaderFlags) => {
    const next = !flags[flag];
    setSaving(flag);
    try {
      const key = PLAYER_READER_KEYS[flag];
      const { error } = await supabase
        .from("site_settings")
        .upsert({ key, value: String(next), updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) throw error;

      setFlags((prev) => ({ ...prev, [flag]: next }));
      queryClient.invalidateQueries({ queryKey: PLAYER_READER_QUERY_KEY });

      const label = FLAGS.find((f) => f.key === flag)?.label || flag;
      toast.success(`${label} ${next ? "ON" : "OFF"} — sabhi students ke liye ${next ? "enable" : "disable"} ho gaya.`);
    } catch (err: unknown) {
      toast.error("Save failed: " + getErrorMessage(err));
      // Revert local state on failure
      setFlags((prev) => ({ ...prev, [flag]: !next }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card data-testid="player-reader-controls">
        <CardContent className="p-8">
          <div className="h-8 w-1/2 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="player-reader-controls" className="border shadow-sm">
      <CardHeader className="border-b pb-4">
        <CardTitle className="flex items-center gap-2">
          <MonitorPlay className="h-5 w-5" />
          Player & Reader Controls
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Player ke branded overlays aur PDF reader ke zoom buttons ko hide / show karein. Ye site-wide lagu hota hai.
        </p>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {FLAGS.map(({ key, label, description }) => (
          <div
            key={key}
            data-testid={`toggle-${key}`}
            className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4"
          >
            <div className="space-y-1">
              <Label htmlFor={`toggle-${key}`} className="text-base font-medium">
                {label}
              </Label>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <Switch
              id={`toggle-${key}`}
              checked={flags[key]}
              disabled={saving === key}
              onCheckedChange={() => toggle(key)}
              aria-label={`Toggle ${label}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
