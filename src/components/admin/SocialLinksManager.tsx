import { useState, useEffect } from "react";
import { useSocialLinks } from "../../hooks/useSocialLinks";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Loader2, Plus, Trash2, Youtube } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

interface SocialLink {
  id: string;
  platform: string;
  url: string;
  is_active: boolean;
  position: number;
}

const ALLOWED_PLATFORMS = ["youtube"];

export default function SocialLinksManager() {
  const { data: existingLinks, isLoading } = useSocialLinks();
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existingLinks) return;
    setLinks(
      existingLinks
        .filter((l) => ALLOWED_PLATFORMS.includes(l.platform.toLowerCase()))
        .sort((a, b) => a.position - b.position)
    );
  }, [existingLinks]);

  const addLink = () => {
    setLinks((prev) => [
      ...prev,
      { id: uuidv4(), platform: "youtube", url: "", is_active: true, position: prev.length },
    ]);
  };

  const updateLink = (id: string, field: keyof SocialLink, value: string | boolean) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const removeLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const save = async () => {
    setSaving(true);
    try {
      const valid = links
        .filter((l) => l.url.trim() !== "")
        .map((l, i) => ({
          ...l,
          platform: l.platform.toLowerCase(),
          url: l.url.trim(),
          position: i,
        }));

      await supabase.from("social_links").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      if (valid.length > 0) {
        const { error } = await supabase.from("social_links").insert(valid);
        if (error) throw error;
      }

      toast.success("Social links saved");
    } catch (err) {
      toast.error("Failed to save social links");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Youtube className="h-5 w-5 text-red-600" />
          Social Links
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No social links configured. Add your YouTube channel below.
          </p>
        )}

        {links.map((link) => (
          <div key={link.id} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center rounded-xl border border-border p-3 bg-muted/20">
            <div className="flex-1 w-full">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Platform</Label>
              <Input value={link.platform} disabled className="mt-1 bg-muted" />
            </div>
            <div className="flex-[2] w-full">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL</Label>
              <Input
                value={link.url}
                onChange={(e) => updateLink(link.id, "url", e.target.value)}
                placeholder="https://youtube.com/..."
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-3 pt-1 sm:pt-0">
              <div className="flex flex-col items-center gap-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Active</Label>
                <Switch
                  checked={link.is_active}
                  onCheckedChange={(v) => updateLink(link.id, "is_active", v)}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeLink(link.id)} className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" onClick={addLink} className="gap-2">
            <Plus className="h-4 w-4" /> Add YouTube
          </Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
