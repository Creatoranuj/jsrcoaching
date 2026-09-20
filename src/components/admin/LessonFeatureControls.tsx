import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import LessonChipManager from "./LessonChipManager";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resetSiteSettingsCache } from "@/lib/siteSettingsCache";
import { useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@/lib/errorMessage";
import {
  LESSON_FEATURE_KEYS,
  LESSON_FEATURE_DEFAULTS,
  LESSON_FEATURE_QUERY_KEY,
  parseLessonFeatureRows,
  type LessonFeatureFlag,
  type LessonFeatureFlags,
  resetLessonFeatureFlagsCache,
} from "@/hooks/useLessonFeatureFlags";

const GROUPS: { title: string; flags: { key: LessonFeatureFlag; label: string; description: string }[] }[] = [
  {
    title: "Lesson chip strip",
    flags: [
      { key: "chipStrip", label: "Chip strip (master switch)", description: "OFF karne par lesson page ke saare chips chhup jaayenge." },
      { key: "chipComments", label: "Comments chip", description: "Lesson ke comments panel ka chip." },
      { key: "chipAttachment", label: "Attachment chip", description: "Lesson ke attachments (PDF/files) ka chip." },
      { key: "chipNotes", label: "Smart Notes chip", description: "Transcript / smart notes panel ka chip." },
      { key: "chipAskDoubt", label: "Ask Doubt chip", description: "Student yahin se doubt bhejta hai." },
      { key: "chipTimeline", label: "Timeline chip", description: "Lecture timeline / chapters list." },
      { key: "chipMyDoubts", label: "My Doubts chip", description: "Student ke apne doubts ki list." },
      { key: "chipBookmarks", label: "Bookmarks chip", description: "Bookmark panel aur bookmark button." },
      { key: "chipMentors", label: "Mentors chip", description: "Mentor / contact details panel." },
      { key: "chipLike", label: "Like chip", description: "Lesson par like button." },
      { key: "chipRating", label: "Rating chip", description: "Lesson rating (stars) panel." },
    ],
  },
  {
    title: "Lesson buttons",
    flags: [
      { key: "pdfDownload", label: "PDF Download button", description: "Lesson ke upar PDF download karne ka button." },
    ],
  },
  {
    title: "Auto-scroll",
    flags: [
      { key: "notesAutoScroll", label: "Auto-scroll on Smart Notes", description: "Notes reader ka auto-scroll floating button." },
      { key: "readerAutoScroll", label: "Auto-scroll on PDF reader", description: "PDF reader ka auto-scroll floating button + speed sheet." },
    ],
  },
  {
    title: "JSR Agent",
    flags: [
      { key: "sadguruAgent", label: "JSR Agent (floating button)", description: "OFF karne par poore app se JSR Agent ka floating button hat jayega." },
    ],
  },
];

export default function LessonFeatureControlsManager() {
  const queryClient = useQueryClient();
  const [flags, setFlags] = useState<LessonFeatureFlags>(LESSON_FEATURE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<LessonFeatureFlag | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("site_settings")
          .select("key, value")
          .in("key", Object.values(LESSON_FEATURE_KEYS));
        if (cancelled) return;
        if (error) throw error;
        setFlags(parseLessonFeatureRows(data || []));
      } catch (err: unknown) {
        toast.error("Failed to load lesson feature controls: " + getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (flag: LessonFeatureFlag, label: string) => {
    const next = !flags[flag];
    setSaving(flag);
    try {
      const { error } = await supabase
        .from("site_settings")
        .upsert(
          {
            key: LESSON_FEATURE_KEYS[flag],
            value: String(next),
            
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" },
        );
      if (error) throw error;

      setFlags((prev) => ({ ...prev, [flag]: next }));
      resetSiteSettingsCache();
      resetLessonFeatureFlagsCache();
      queryClient.invalidateQueries({ queryKey: LESSON_FEATURE_QUERY_KEY });
      toast.success(`${label} ${next ? "ON" : "OFF"} — sabhi students ke liye lagu ho gaya.`, {
        id: `lesson-flag-${flag}`,
      });
    } catch (err: unknown) {
      toast.error("Save failed: " + getErrorMessage(err), { id: `lesson-flag-${flag}` });
      setFlags((prev) => ({ ...prev, [flag]: !next }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading lesson feature controls…</div>;
  }

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4" />
              {group.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.flags.map((f) => (
              <div key={f.key} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor={`lesson-flag-${f.key}`} className="text-sm font-medium">
                    {f.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                </div>
                <Switch
                  id={`lesson-flag-${f.key}`}
                  checked={flags[f.key]}
                  disabled={saving === f.key}
                  onCheckedChange={() => toggle(f.key, f.label)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <LessonChipManager />
    </div>
  );
}
