import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, LayoutGrid } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  LESSON_CHIP_CONFIG_KEY,
  LESSON_CHIP_TYPES,
  emptyLessonChipConfig,
  parseLessonChipConfig,
  serializeLessonChipConfig,
  type CustomLessonChip,
  type LessonChipConfig,
  type LessonChipScopeConfig,
  type LessonChipScopeType,
} from "@/features/lesson/lib/lessonChipConfig";
import type { LessonChipIcon } from "@/features/lesson/lib/lessonChips";
import { LESSON_CHIP_CONFIG_QUERY_KEY } from "@/hooks/useLessonChipConfig";
import { getErrorMessage } from "@/lib/errorMessage";

const BUILT_IN_CHIPS: { id: string; label: string }[] = [
  { id: "comments", label: "Comments" },
  { id: "attachment", label: "Attachment" },
  { id: "notes", label: "Smart Notes" },
  { id: "ask-doubt", label: "Ask Doubt" },
  { id: "timeline", label: "Timeline" },
  { id: "my-doubts", label: "My Doubts" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "mentors", label: "Mentors" },
  { id: "like", label: "Like" },
  { id: "rating", label: "Rating" },
];

const ICON_OPTIONS: LessonChipIcon[] = [
  "attachment", "comments", "notes", "ask-doubt", "timeline",
  "my-doubts", "bookmarks", "mentors", "like", "rating",
];

const EMPTY: LessonChipScopeConfig = { hidden: [], custom: [] };

/**
 * Admin chip manager — hide built-in chips and add custom link chips, either
 * as a default for a content type or as an override for a single lesson id.
 */
export default function LessonChipManager() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<LessonChipConfig>(emptyLessonChipConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scopeType, setScopeType] = useState<LessonChipScopeType>("LECTURE");
  const [lessonId, setLessonId] = useState("");
  const [newChip, setNewChip] = useState<{ label: string; icon: LessonChipIcon; url: string }>({
    label: "",
    icon: "attachment",
    url: "",
  });

  const scopeKey = lessonId.trim() ? `lesson:${lessonId.trim()}` : `type:${scopeType}`;
  const scope: LessonChipScopeConfig = lessonId.trim()
    ? config.lessons[lessonId.trim()] ?? EMPTY
    : config.types[scopeType] ?? EMPTY;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("site_settings")
          .select("key, value")
          .eq("key", LESSON_CHIP_CONFIG_KEY)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setConfig(parseLessonChipConfig(data?.value ?? null));
      } catch (err: unknown) {
        toast.error("Chip config load failed: " + getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = async (next: LessonChipConfig) => {
    const previous = config;
    setConfig(next);
    setSaving(true);
    try {
      const { error } = await supabase.from("site_settings").upsert(
        {
          key: LESSON_CHIP_CONFIG_KEY,
          value: serializeLessonChipConfig(next),
          
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: LESSON_CHIP_CONFIG_QUERY_KEY });
      toast.success("Chip settings saved — students ke liye lagu ho gaya.", { id: "chip-config" });
    } catch (err: unknown) {
      setConfig(previous);
      toast.error("Save failed: " + getErrorMessage(err), { id: "chip-config" });
    } finally {
      setSaving(false);
    }
  };

  const writeScope = (updater: (s: LessonChipScopeConfig) => LessonChipScopeConfig) => {
    const nextScope = updater(scope);
    const next: LessonChipConfig = {
      types: { ...config.types },
      lessons: { ...config.lessons },
    };
    if (lessonId.trim()) next.lessons[lessonId.trim()] = nextScope;
    else next.types[scopeType] = nextScope;
    void persist(next);
  };

  const toggleBuiltIn = (id: string, visible: boolean) =>
    writeScope((s) => ({
      ...s,
      hidden: visible ? s.hidden.filter((h) => h !== id) : Array.from(new Set([...s.hidden, id])),
    }));

  const addCustom = () => {
    const label = newChip.label.trim();
    if (!label) { toast.error("Chip ka naam likhein."); return; }
    const chip: CustomLessonChip = {
      id: `custom-${Date.now().toString(36)}`,
      label,
      icon: newChip.icon,
      url: newChip.url.trim(),
      order: scope.custom.length,
    };
    writeScope((s) => ({ ...s, custom: [...s.custom, chip] }));
    setNewChip({ label: "", icon: "attachment", url: "" });
  };

  const move = (index: number, delta: number) =>
    writeScope((s) => {
      const list = s.custom.slice();
      const target = index + delta;
      if (target < 0 || target >= list.length) return s;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...s, custom: list.map((c, i) => ({ ...c, order: i })) };
    });

  const removeCustom = (id: string) =>
    writeScope((s) => ({ ...s, custom: s.custom.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i })) }));

  const updateCustom = (id: string, patch: Partial<CustomLessonChip>) =>
    writeScope((s) => ({ ...s, custom: s.custom.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading chip manager…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutGrid className="h-4 w-4" />
          Chip Manager (hide / add chips)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scope picker */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {LESSON_CHIP_TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={!lessonId.trim() && scopeType === t ? "default" : "outline"}
                onClick={() => { setLessonId(""); setScopeType(t); }}
              >
                {t}
              </Button>
            ))}
          </div>
          <div>
            <Label htmlFor="chip-lesson-id" className="text-xs">
              Single lesson override (lesson ID) — khali chhodne par upar wale type ka default lagega
            </Label>
            <Input
              id="chip-lesson-id"
              value={lessonId}
              placeholder="lesson uuid"
              onChange={(e) => setLessonId(e.target.value)}
              className="mt-1"
            />
          </div>
          <p className="text-xs text-muted-foreground">Editing: {scopeKey}</p>
        </div>

        {/* Built-in chips */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Built-in chips</p>
          {BUILT_IN_CHIPS.map((c) => {
            const visible = !scope.hidden.includes(c.id);
            return (
              <div key={c.id} className="flex items-center justify-between gap-4">
                <Label htmlFor={`chip-vis-${c.id}`} className="text-sm">{c.label}</Label>
                <Switch
                  id={`chip-vis-${c.id}`}
                  checked={visible}
                  disabled={saving}
                  onCheckedChange={(v) => toggleBuiltIn(c.id, v)}
                />
              </div>
            );
          })}
        </div>

        {/* Custom chips */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Custom chips (link / website)</p>
          {scope.custom.length === 0 && (
            <p className="text-xs text-muted-foreground">Abhi koi custom chip nahi hai.</p>
          )}
          {scope.custom.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={c.label}
                  onChange={(e) => updateCustom(c.id, { label: e.target.value })}
                  placeholder="Label"
                />
                <select
                  value={c.icon}
                  onChange={(e) => updateCustom(c.id, { icon: e.target.value as LessonChipIcon })}
                  className="rounded-md border border-input bg-background px-2 text-sm"
                >
                  {ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                </select>
              </div>
              <Input
                value={c.url}
                onChange={(e) => updateCustom(c.id, { url: e.target.value })}
                placeholder="https://…"
              />
              <div className="flex justify-end gap-1">
                <Button type="button" size="icon" variant="outline" disabled={saving || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" disabled={saving || i === scope.custom.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="destructive" disabled={saving} onClick={() => removeCustom(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                value={newChip.label}
                onChange={(e) => setNewChip((p) => ({ ...p, label: e.target.value }))}
                placeholder="Naya chip ka naam"
              />
              <select
                value={newChip.icon}
                onChange={(e) => setNewChip((p) => ({ ...p, icon: e.target.value as LessonChipIcon }))}
                className="rounded-md border border-input bg-background px-2 text-sm"
              >
                {ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
              </select>
            </div>
            <Input
              value={newChip.url}
              onChange={(e) => setNewChip((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://… (chip tap par khulega)"
            />
            <Button type="button" size="sm" disabled={saving} onClick={addCustom}>
              <Plus className="h-4 w-4 mr-1" /> Add chip
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
