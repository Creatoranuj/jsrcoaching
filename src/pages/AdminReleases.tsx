import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Layout/Header";
import Sidebar from "@/components/Layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Plus, RefreshCw, Trash2 } from "lucide-react";
import { reportError } from "@/lib/sentry";
import { fetchReleases, type AppRelease, type ReleaseStatus } from "@/lib/releases";

const VERSION_RE = /^\d+(\.\d+){0,3}$/;

interface ReleaseForm {
  version: string;
  title: string;
  notes: string;
  status: ReleaseStatus;
  is_current: boolean;
  released_at: string;
}

const EMPTY: ReleaseForm = {
  version: "",
  title: "",
  notes: "",
  status: "supported",
  is_current: false,
  released_at: new Date().toISOString().slice(0, 10),
};

export default function AdminReleases() {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ReleaseForm>(EMPTY);

  const load = async () => {
    setLoading(true);
    try {
      setReleases(await fetchReleases());
    } catch (err) {
      reportError(err, { surface: "AdminReleases.load" });
      toast.error("Releases load nahi ho payi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!VERSION_RE.test(form.version.trim())) {
      toast.error("Version aise likhein: 1.8.3");
      return;
    }
    setSaving(true);
    try {
      // Sirf ek current release ho sakti hai — pehle baaki ka flag hatao.
      if (form.is_current) {
        const { error: clearError } = await supabase
          .from("app_releases")
          .update({ is_current: false })
          .eq("is_current", true);
        if (clearError) throw clearError;
      }
      const { error } = await supabase.from("app_releases").upsert(
        {
          version: form.version.trim(),
          title: form.title.trim(),
          notes: form.notes.trim(),
          status: form.status,
          is_current: form.is_current,
          released_at: form.released_at,
        },
        { onConflict: "version" },
      );
      if (error) throw error;
      toast.success(`v${form.version.trim()} save ho gaya`);
      setForm(EMPTY);
      await load();
    } catch (err) {
      reportError(err, { surface: "AdminReleases.save" });
      toast.error("Save nahi ho paya");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (release: AppRelease, status: ReleaseStatus) => {
    try {
      const { error } = await supabase
        .from("app_releases")
        .update({ status })
        .eq("id", release.id);
      if (error) throw error;
      toast.success(`v${release.version} → ${status}`);
      await load();
    } catch (err) {
      reportError(err, { surface: "AdminReleases.setStatus" });
      toast.error("Status change nahi hua");
    }
  };

  const makeCurrent = async (release: AppRelease) => {
    try {
      const { error: clearError } = await supabase
        .from("app_releases")
        .update({ is_current: false })
        .eq("is_current", true);
      if (clearError) throw clearError;
      const { error } = await supabase
        .from("app_releases")
        .update({ is_current: true })
        .eq("id", release.id);
      if (error) throw error;
      toast.success(`v${release.version} ab current release hai`);
      await load();
    } catch (err) {
      reportError(err, { surface: "AdminReleases.makeCurrent" });
      toast.error("Current set nahi hua");
    }
  };

  const remove = async (release: AppRelease) => {
    if (!window.confirm(`v${release.version} delete karein?`)) return;
    try {
      const { error } = await supabase
        .from("app_releases")
        .delete()
        .eq("id", release.id);
      if (error) throw error;
      toast.success(`v${release.version} delete ho gaya`);
      await load();
    } catch (err) {
      reportError(err, { surface: "AdminReleases.remove" });
      toast.error("Delete nahi ho paya");
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-6 max-w-4xl">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" /> Admin Home
          </Button>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" /> Naya Release
              </CardTitle>
              <CardDescription>
                Yeh release public /releases page par students ko dikhega.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rel-version">Version</Label>
                  <Input
                    id="rel-version"
                    placeholder="1.8.3"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rel-date">Release date</Label>
                  <Input
                    id="rel-date"
                    type="date"
                    value={form.released_at}
                    onChange={(e) => setForm({ ...form, released_at: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rel-title">Title</Label>
                <Input
                  id="rel-title"
                  placeholder="UPI payments fix + fullscreen video"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rel-notes">Release notes (students ko dikhenge)</Label>
                <Textarea
                  id="rel-notes"
                  rows={4}
                  placeholder={"- Razorpay UPI app se payment ab Android app me kaam karta hai\n- PDF reader offline error ab saaf batata hai"}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 items-end">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as ReleaseStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="supported">Supported — chalta rahega</SelectItem>
                      <SelectItem value="deprecated">Purana — chalega, par update salah</SelectItem>
                      <SelectItem value="forced_update">Update zaroori — version band</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="rel-current"
                    checked={form.is_current}
                    onCheckedChange={(v) => setForm({ ...form, is_current: v })}
                  />
                  <Label htmlFor="rel-current">Yeh current release hai</Label>
                </div>
              </div>
              <Button onClick={() => void save()} disabled={saving} className="gap-2">
                <Plus className="h-4 w-4" /> {saving ? "Saving…" : "Release Save Karein"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Release History</CardTitle>
                <Button variant="outline" size="sm" onClick={() => void load()} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
              </div>
              <CardDescription>
                Status badalte hi students ke app par agla version check usi hisaab se hoga.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!loading && releases.length === 0 && (
                <p className="text-sm text-muted-foreground">Koi release nahi hai abhi.</p>
              )}
              {releases.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">v{r.version}</span>
                      {r.is_current && <Badge className="bg-green-600 text-white hover:bg-green-600">Current</Badge>}
                      <Badge
                        variant={r.status === "forced_update" ? "destructive" : r.status === "deprecated" ? "secondary" : "outline"}
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {r.title || "(no title)"} · {r.released_at}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={r.status}
                      onValueChange={(v) => void setStatus(r, v as ReleaseStatus)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supported">Supported</SelectItem>
                        <SelectItem value="deprecated">Purana</SelectItem>
                        <SelectItem value="forced_update">Update zaroori</SelectItem>
                      </SelectContent>
                    </Select>
                    {!r.is_current && (
                      <Button variant="outline" size="sm" onClick={() => void makeCurrent(r)}>
                        Make Current
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => void remove(r)} aria-label={`Delete v${r.version}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
