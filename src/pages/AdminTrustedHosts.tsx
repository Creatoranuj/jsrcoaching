import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Layout/Header";
import Sidebar from "@/components/Layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, Pencil, Copy, ShieldCheck, RefreshCw, Globe,
} from "lucide-react";
import {
  useTrustedHosts,
  type TrustedHost,
  type TrustedHostCategory,
} from "@/hooks/useTrustedHosts";

const CATEGORY_LABEL: Record<TrustedHostCategory, string> = {
  frame:   "PDF / Notes / Embed (frame-src)",
  image:   "Image CDN (img-src)",
  media:   "Video / Audio CDN (media-src)",
  website: "External Website Links",
  script:  "Script CDN (script-src)",
  connect: "API / WebSocket (connect-src)",
};

const CATEGORY_DIRECTIVE: Record<TrustedHostCategory, string> = {
  frame:   "frame-src",
  image:   "img-src",
  media:   "media-src",
  website: "frame-src",
  script:  "script-src",
  connect: "connect-src",
};

function normalizeHost(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return s;
}

export default function AdminTrustedHosts() {
  const navigate = useNavigate();
  const { hosts, loading, refetch } = useTrustedHosts();

  // Form state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrustedHost | null>(null);
  const [host, setHost] = useState("");
  const [category, setCategory] = useState<TrustedHostCategory>("frame");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<TrustedHostCategory | "all">("all");

  const filtered = useMemo(
    () => (filter === "all" ? hosts : hosts.filter((h) => h.category === filter)),
    [hosts, filter]
  );

  const resetForm = () => {
    setEditing(null); setHost(""); setCategory("frame");
    setLabel(""); setNotes(""); setEnabled(true);
  };

  const openCreate = () => { resetForm(); setOpen(true); };

  const openEdit = (h: TrustedHost) => {
    setEditing(h);
    setHost(h.host); setCategory(h.category);
    setLabel(h.label ?? ""); setNotes(h.notes ?? ""); setEnabled(h.enabled);
    setOpen(true);
  };

  const handleSave = async () => {
    const clean = normalizeHost(host);
    if (!clean || clean.length > 253) {
      toast.error("Enter a valid host (e.g. docs.google.com)");
      return;
    }
    setSaving(true);
    const payload = {
      host: clean,
      category,
      label: label.trim() || null,
      notes: notes.trim() || null,
      enabled,
    };
    const { error } = editing
      ? await supabase.from("trusted_hosts").update(payload).eq("id", editing.id)
      : await supabase.from("trusted_hosts").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Host updated" : "Host added");
    setOpen(false); resetForm(); refetch();
  };

  const handleToggle = async (h: TrustedHost, val: boolean) => {
    const { error } = await supabase
      .from("trusted_hosts").update({ enabled: val }).eq("id", h.id);
    if (error) toast.error(error.message); else { toast.success("Updated"); refetch(); }
  };

  const handleDelete = async (h: TrustedHost) => {
    if (!confirm(`Remove ${h.host}?`)) return;
    const { error } = await supabase.from("trusted_hosts").delete().eq("id", h.id);
    if (error) toast.error(error.message); else { toast.success("Removed"); refetch(); }
  };

  // Build CSP snippet from enabled hosts (per directive)
  const cspByDirective = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const h of hosts) {
      if (!h.enabled) continue;
      const dir = CATEGORY_DIRECTIVE[h.category];
      if (!map.has(dir)) map.set(dir, new Set());
      map.get(dir)!.add(`https://${h.host}`);
    }
    return Array.from(map.entries()).map(([dir, set]) => ({
      directive: dir,
      sources: Array.from(set).sort(),
    }));
  }, [hosts]);

  const cspText = useMemo(
    () =>
      cspByDirective
        .map(({ directive, sources }) => `${directive} 'self' ${sources.join(" ")};`)
        .join("\n"),
    [cspByDirective]
  );

  const copyCsp = async () => {
    try {
      await navigator.clipboard.writeText(cspText);
      toast.success("CSP snippet copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 max-w-6xl mx-auto w-full">
          <div className="flex flex-wrap items-start gap-2 sm:gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0 order-2 sm:order-none basis-full sm:basis-0">
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 break-words">
                <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                <span className="min-w-0">Trusted Hosts / CSP Manager</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                यहाँ से app में allowed external links manage करें — Code edit नहीं करना पड़ेगा।
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => refetch()} aria-label="Refresh">
                <RefreshCw className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button size="sm" onClick={openCreate} aria-label="Add Host">
                <Plus className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Add Host</span>
              </Button>
            </div>
          </div>

          <Tabs defaultValue="list">
            <TabsList>
              <TabsTrigger value="list">All Hosts ({hosts.length})</TabsTrigger>
              <TabsTrigger value="csp">CSP Snippet</TabsTrigger>
              <TabsTrigger value="help">How it works</TabsTrigger>
            </TabsList>

            {/* LIST */}
            <TabsContent value="list" className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Filter:</Label>
                <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {(Object.keys(CATEGORY_LABEL) as TrustedHostCategory[]).map((c) => (
                      <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : filtered.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">
                  कोई host नहीं मिला। "Add Host" से जोड़ें।
                </CardContent></Card>
              ) : (
                <div className="grid gap-2">
                  {filtered.map((h) => (
                    <Card key={h.id}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-medium truncate">{h.host}</span>
                            <Badge variant="secondary" className="text-xs">
                              {CATEGORY_LABEL[h.category]}
                            </Badge>
                            {!h.enabled && <Badge variant="outline" className="text-xs">disabled</Badge>}
                          </div>
                          {h.label && <p className="text-xs text-muted-foreground mt-0.5">{h.label}</p>}
                        </div>
                        <Switch
                          checked={h.enabled}
                          onCheckedChange={(v) => handleToggle(h, v)}
                        />
                        <Button variant="ghost" size="icon" onClick={() => openEdit(h)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(h)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* CSP SNIPPET */}
            <TabsContent value="csp" className="mt-4 space-y-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Generated CSP directives</CardTitle>
                  <Button size="sm" onClick={copyCsp}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">
                    App का runtime CSP पहले से <code>https:</code> allow करता है, इसलिए कोई भी enabled
                    host instantly काम करता है (कोई rebuild ज़रूरी नहीं)। नीचे की snippet तब काम
                    आती है जब आप future में CSP को tight करना चाहें — सिर्फ इसे <code>index.html</code> में
                    paste करें।
                  </p>
                  <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap break-all font-mono">
{cspText || "(no enabled hosts)"}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            {/* HELP */}
            <TabsContent value="help" className="mt-4">
              <Card><CardContent className="p-5 space-y-3 text-sm leading-relaxed">
                <p><b>यह panel क्या करता है?</b></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>App में जो भी external links/iframes (PDF viewer, YouTube, Drive, CDN, websites) use होते हैं उनकी allowlist यहाँ centrally manage होती है।</li>
                  <li>Host जोड़ने पर <b>तुरंत</b> काम करता है — कोड edit/redeploy की ज़रूरत नहीं (CSP पहले से <code>https:</code> permissive है)।</li>
                  <li>"CSP Snippet" tab से आप future strict-mode के लिए exact CSP line copy कर सकते हैं।</li>
                  <li>"Disabled" hosts app में कहीं भी render नहीं होंगे (app-level guard के साथ)।</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  Category guide: <b>frame</b> = iframe में open होने वाले PDF/Embed; <b>image/media</b> = images/videos के CDN;
                  <b> website</b> = footer/about जैसी जगहों पर दिखने वाले external link;
                  <b> script/connect</b> = सिर्फ developer-level changes के लिए।
                </p>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>


      {/* CREATE / EDIT DIALOG */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Trusted Host" : "Add Trusted Host"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Host (domain only)</Label>
              <Input
                placeholder="docs.google.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                maxLength={253}
              />
              <p className="text-xs text-muted-foreground mt-1">
                बिना <code>https://</code> के लिखें। Subdomain भी allowed है।
              </p>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABEL) as TrustedHostCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100} />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
