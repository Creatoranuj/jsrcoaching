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
import { toast } from "sonner";
import { ArrowLeft, BellRing, RefreshCw, Save, Smartphone } from "lucide-react";
import { reportError } from "@/lib/sentry";
import { UPDATE_PAGE_URL } from "@/config/updatePage";
import { openInSystemBrowser } from "@/lib/native/browser";

interface ConfigForm {
  latest_android_version: string;
  min_android_version: string;
  android_store_url: string;
  update_notes: string;
  update_message: string;
  force_update: boolean;
}

interface LogRow {
  id: string;
  title: string;
  body: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

const EMPTY: ConfigForm = {
  latest_android_version: "",
  min_android_version: "",
  android_store_url: "",
  update_notes: "",
  update_message: "",
  force_update: false,
};

export default function AdminAppUpdate() {
  const navigate = useNavigate();
  // Header's menu button calls onMenuClick unconditionally; without this
  // state the hamburger threw on mobile and the drawer could never open.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [form, setForm] = useState<ConfigForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pushTitle, setPushTitle] = useState("App update available");
  const [pushBody, setPushBody] = useState("Naya version aa gaya hai. Abhi update karein.");
  const [sending, setSending] = useState(false);
  const [attachUpdateLink, setAttachUpdateLink] = useState(true);
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [cfg, tokens, log] = await Promise.all([
        supabase
          .from("app_config")
          .select(
            "latest_android_version,min_android_version,android_store_url,update_notes,update_message,force_update"
          )
          .eq("id", 1)
          .maybeSingle(),
        supabase.from("push_tokens").select("*", { count: "exact", head: true }),
        supabase
          .from("push_notifications_log")
          .select("id,title,body,sent_count,failed_count,created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (cfg.error) throw cfg.error;
      if (cfg.data) {
        setForm({
          latest_android_version: cfg.data.latest_android_version ?? "",
          min_android_version: cfg.data.min_android_version ?? "",
          android_store_url: cfg.data.android_store_url ?? "",
          update_notes: cfg.data.update_notes ?? "",
          update_message: cfg.data.update_message ?? "",
          force_update: Boolean(cfg.data.force_update),
        });
      }
      setDeviceCount(tokens.count ?? 0);
      setLogs((log.data as LogRow[]) ?? []);
    } catch (err) {
      reportError(err, { surface: "AdminAppUpdate.load" });
      toast.error("Settings load nahi ho payi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!/^\d+(\.\d+){0,3}$/.test(form.latest_android_version)) {
      toast.error("Latest version aise likhein: 1.8.3");
      return;
    }
    if (!/^\d+(\.\d+){0,3}$/.test(form.min_android_version)) {
      toast.error("Minimum version aise likhein: 1.0.0");
      return;
    }
    if (!form.android_store_url.startsWith("https://")) {
      toast.error("Update link https:// se shuru hona chahiye");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("app_config")
        .update({
          latest_android_version: form.latest_android_version,
          latest_ios_version: form.latest_android_version,
          min_android_version: form.min_android_version,
          android_store_url: form.android_store_url,
          ios_store_url: form.android_store_url,
          update_notes: form.update_notes,
          update_message: form.update_message,
          force_update: form.force_update,
        })
        .eq("id", 1);
      if (error) throw error;
      toast.success("Update settings save ho gayi");
    } catch (err) {
      reportError(err, { surface: "AdminAppUpdate.save" });
      toast.error("Save nahi ho paya");
    } finally {
      setSaving(false);
    }
  };

  const broadcast = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      toast.error("Title aur message dono bharein");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push", {
        body: {
          title: pushTitle.trim(),
          body: pushBody.trim(),
          path: "/install",
          // Tap opens the public update page in the phone's real browser, where
          // the APK can actually download.
          ...(attachUpdateLink ? { url: UPDATE_PAGE_URL } : {}),
        },
      });
      if (error) throw error;
      const res = data as { sent?: number; failed?: number; total?: number; error?: string } | null;
      if (res?.error === "PUSH_NOT_CONFIGURED") {
        toast.error("Push abhi setup nahi hua (Firebase key missing)");
        return;
      }
      toast.success(`Notification bheji gayi — ${res?.sent ?? 0} phone, ${res?.failed ?? 0} fail`);
      void load();
    } catch (err) {
      reportError(err, { surface: "AdminAppUpdate.broadcast" });
      toast.error("Notification nahi bhej paye");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-3xl">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">App Update &amp; Notification</h1>
              <p className="text-sm text-muted-foreground">
                Purane version wale students ko update karwayein
              </p>
            </div>
            <Button variant="outline" size="icon" className="ml-auto" onClick={() => void load()} aria-label="Reload">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="h-4 w-4" /> Version settings
              </CardTitle>
              <CardDescription>
                App khulte hi popup dikhega jab student ka version in se purana ho.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="latest">Latest version</Label>
                  <Input
                    id="latest"
                    value={form.latest_android_version}
                    onChange={(e) => setForm({ ...form, latest_android_version: e.target.value })}
                    placeholder="1.8.2"
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">Halka popup — student &quot;Baad me&quot; dabaa sakta hai.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="min">Minimum version</Label>
                  <Input
                    id="min"
                    value={form.min_android_version}
                    onChange={(e) => setForm({ ...form, min_android_version: e.target.value })}
                    placeholder="1.0.0"
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">Is se purana version app hi nahi chalne dega.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="url">Update link</Label>
                <Input
                  id="url"
                  value={form.android_store_url}
                  onChange={(e) => setForm({ ...form, android_store_url: e.target.value })}
                  placeholder="https://jsrcoaching.vercel.app/install"
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">
                  Naya APK release hote hi ye link apne aap set ho jata hai. App ka
                  "Update karein" button hamesha ek sthir link kholta hai jo nayi
                  release par pahunchata hai — isse haath se badalne ki zaroorat nahi.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Halke popup ka message</Label>
                <Textarea
                  id="notes"
                  value={form.update_notes}
                  onChange={(e) => setForm({ ...form, update_notes: e.target.value })}
                  rows={2}
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="message">Zaroori update ka message</Label>
                <Textarea
                  id="message"
                  value={form.update_message}
                  onChange={(e) => setForm({ ...form, update_message: e.target.value })}
                  rows={2}
                  disabled={loading}
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div>
                  <Label htmlFor="force" className="font-medium">Sabko abhi update karwayein</Label>
                  <p className="text-xs text-muted-foreground">
                    On karne par latest se purane version wale app use nahi kar payenge.
                  </p>
                </div>
                <Switch
                  id="force"
                  checked={form.force_update}
                  onCheckedChange={(v) => setForm({ ...form, force_update: v })}
                  disabled={loading}
                />
              </div>

              <Button onClick={save} disabled={saving || loading} className="gap-2">
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="h-4 w-4" /> Notification bhejein
              </CardTitle>
              <CardDescription>
                {deviceCount === null
                  ? "Devices load ho rahe hain…"
                  : `${deviceCount} phone par notification jayegi. Tap karne se install page khulega.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ptitle">Title</Label>
                <Input id="ptitle" value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pbody">Message</Label>
                <Textarea id="pbody" value={pushBody} onChange={(e) => setPushBody(e.target.value)} rows={3} maxLength={500} />
              </div>
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Switch
                  id="attach-update"
                  checked={attachUpdateLink}
                  onCheckedChange={setAttachUpdateLink}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <Label htmlFor="attach-update" className="cursor-pointer">Update page link jodein</Label>
                  <p className="text-xs text-muted-foreground">
                    Notification tap karne par phone ka asli browser khulega aur wahan se
                    naya APK download + install ho jayega.
                  </p>
                  <button
                    type="button"
                    onClick={() => void openInSystemBrowser(UPDATE_PAGE_URL)}
                    className="mt-1 text-xs font-medium text-primary underline underline-offset-2"
                  >
                    Update page dekhein
                  </button>
                </div>
              </div>
              <Button onClick={broadcast} disabled={sending} className="gap-2">
                <BellRing className="h-4 w-4" /> {sending ? "Bhej rahe hain…" : "Sabko bhejein"}
              </Button>

              {logs.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-sm font-medium">Pichhli notifications</p>
                  {logs.map((l) => (
                    <div key={l.id} className="rounded-md border p-2 text-sm">
                      <div className="font-medium">{l.title}</div>
                      <div className="text-muted-foreground text-xs">{l.body}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(l.created_at).toLocaleString()} · {l.sent_count} bheji · {l.failed_count} fail
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
