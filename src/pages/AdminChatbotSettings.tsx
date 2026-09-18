import { useState, useEffect } from "react";
import { tapHaptic } from "@/lib/native/haptics";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { ScrollArea } from "../components/ui/scroll-area";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errorMessage";
import {
  Bot, Plus, Trash2, Save, Settings, MessageSquare, ToggleLeft, ToggleRight, Loader2,
  BookOpen, RefreshCw, Brain, Edit2, Check, X, ChevronDown, ChevronUp, Search,
  Globe, Link, Clock, AlertCircle, CheckCircle2, ExternalLink
} from "lucide-react";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

interface ChatbotSettings {
  id: number;
  system_prompt: string;
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  enable_mock_help: boolean;
}

interface ChatLog {
  id: string;
  user_id: string | null;
  message: string;
  response: string;
  created_at: string;
}

interface KnowledgeEntry {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string[];
  is_active: boolean;
  position: number;
  created_at: string;
}

const ACTIVE_CHATBOT_MODEL = "google/gemini-3.5-flash";

function normalizeChatbotSettings(settings: ChatbotSettings): ChatbotSettings {
  return {
    ...settings,
    model: ACTIVE_CHATBOT_MODEL,
    max_tokens: Math.min(Math.max(Number(settings.max_tokens) || 2000, 200), 3000),
  };
}

interface CrawlHistoryEntry {
  id: string;
  url: string;
  status: 'pending' | 'completed' | 'failed';
  knowledge_entries_created: number;
  crawled_at: string;
  error_message?: string;
  title?: string;
  content_preview?: string;
}

const CATEGORIES = [
  { value: 'platform_guide', label: '🖥️ Platform Guide', color: 'bg-blue-100 text-blue-700' },
  { value: 'courses', label: '📚 Courses', color: 'bg-green-100 text-green-700' },
  { value: 'faqs', label: '❓ FAQs', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'policies', label: '📋 Policies', color: 'bg-purple-100 text-purple-700' },
  { value: 'general', label: '💡 General', color: 'bg-gray-100 text-gray-700' },
];

const getCategoryStyle = (cat: string) =>
  CATEGORIES.find(c => c.value === cat)?.color || 'bg-muted text-muted-foreground';

const getCategoryLabel = (cat: string) =>
  CATEGORIES.find(c => c.value === cat)?.label || cat;

const ChatbotSettings = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<ChatbotSettings | null>(null);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "", category: "general" });
  const [addingFaq, setAddingFaq] = useState(false);

  // Knowledge base state
  const [kbSearch, setKbSearch] = useState('');
  const [kbCategory, setKbCategory] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<KnowledgeEntry>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingKb, setSavingKb] = useState(false);
  const [newKbEntry, setNewKbEntry] = useState({
    category: 'platform_guide', title: '', content: '', keywords: ''
  });
  const [addingKb, setAddingKb] = useState(false);
  const [showAddKb, setShowAddKb] = useState(false);

  // Web Crawler state
  const [crawlUrl, setCrawlUrl] = useState('');
  const [crawlCategory, setCrawlCategory] = useState('general');
  const [crawling, setCrawling] = useState(false);
  const [scrapingFC, setScrapingFC] = useState(false);
  const [embedBackfilling, setEmbedBackfilling] = useState(false);
  const [crawlHistory, setCrawlHistory] = useState<CrawlHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!isAdmin) { navigate("/dashboard"); return; }
    fetchData();
    fetchCrawlHistory();
  }, [isAdmin, navigate]);

  const fetchCrawlHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('crawl_history')
        .select('*')
        .order('crawled_at', { ascending: false })
        .limit(20);
      setCrawlHistory((data ?? []) as CrawlHistoryEntry[]);
    } catch { /* silently fail */ } finally {
      setLoadingHistory(false);
    }
  };

  const triggerCrawl = async () => {
    if (!crawlUrl.trim()) { toast.error("URL daalo pehle!"); return; }
    setCrawling(true);
    toast.info("🕷️ Crawling started... Yeh 20-30 seconds le sakta hai");
    try {
      const { data, error } = await supabase.functions.invoke('crawl4ai-bridge', {
        body: { url: crawlUrl.trim(), mode: 'ingest', category: crawlCategory },
      });
      if (error || data?.error) {
        const msg = data?.error || error?.message || 'Crawl failed';
        toast.error(`❌ ${msg}`);
      } else {
        toast.success(`✅ Crawl complete! ${data.entriesCreated} entries added to Sarthi's memory 🧠`);
        setCrawlUrl('');
        // Refresh both lists
        fetchCrawlHistory();
        const { data: kbData } = await supabase.from('knowledge_base').select('*').order('position', { ascending: true });
        setKnowledge((kbData || []) as KnowledgeEntry[]);
      }
    } catch (e: unknown) {
      toast.error(`❌ ${getErrorMessage(e) || 'Network error'}`);
    } finally {
      setCrawling(false);
    }
  };

  // Firecrawl fallback — JS-rendered pages that crawl4ai can't handle. Saves
  // the scraped markdown as a knowledge_base entry so Sarthi can retrieve it.
  const triggerFirecrawl = async () => {
    if (!crawlUrl.trim()) { toast.error("URL daalo pehle!"); return; }
    setScrapingFC(true);
    toast.info("🔥 Firecrawl scraping (JS-rendered)...");
    try {
      const { data, error } = await supabase.functions.invoke('firecrawl-scrape', {
        body: { url: crawlUrl.trim(), options: { formats: ['markdown'], onlyMainContent: true } },
      });
      if (error || data?.error) {
        toast.error(`❌ ${data?.error?.message || data?.error || error?.message || 'Scrape failed'}`);
        return;
      }
      const md = data?.data?.markdown || data?.markdown || '';
      const title = data?.data?.metadata?.title || data?.metadata?.title || crawlUrl.trim();
      if (!md) { toast.error("❌ No markdown returned"); return; }
      const { error: insErr } = await supabase.from('knowledge_base').insert({
        title: String(title).slice(0, 200),
        content: md.slice(0, 20000),
        category: crawlCategory,
        keywords: [], is_active: true, position: 999,
      });
      if (insErr) { toast.error(`❌ Save failed: ${insErr.message}`); return; }
      toast.success(`✅ Firecrawl entry added — remember to generate embedding.`);
      setCrawlUrl('');
      const { data: kbData } = await supabase.from('knowledge_base').select('*').order('position', { ascending: true });
      setKnowledge((kbData || []) as KnowledgeEntry[]);
    } catch (e: unknown) {
      toast.error(`❌ ${getErrorMessage(e) || 'Network error'}`);
    } finally {
      setScrapingFC(false);
    }
  };

  // Backfill embeddings for KB entries missing them. Bounded to 20 per click to
  // stay under edge-function/AI-gateway timeouts; run again for more.
  const backfillEmbeddings = async () => {
    setEmbedBackfilling(true);
    try {
      const { data: rows, error } = await supabase
        .from('knowledge_base')
        .select('id, title')
        .is('embedding', null)
        .eq('is_active', true)
        .limit(20);
      if (error) { toast.error(`❌ ${error.message}`); return; }
      if (!rows || rows.length === 0) { toast.success("✅ All embeddings up to date"); return; }
      toast.info(`⚙️ Generating ${rows.length} embedding(s)...`);
      let ok = 0, fail = 0;
      for (const r of rows) {
        const { data, error: fnErr } = await supabase.functions.invoke('generate-embedding', {
          body: { action: 'embed_knowledge', knowledgeBaseId: r.id },
        });
        if (fnErr || data?.error) fail++; else ok++;
      }
      toast[fail === 0 ? 'success' : 'info'](`Embeddings: ${ok} ok, ${fail} failed`);
    } finally {
      setEmbedBackfilling(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: settingsData }, { data: faqData }, { data: logsData }, { data: kbData }] = await Promise.all([
        supabase.from("chatbot_settings").select("*").eq("id", 1).single(),
        supabase.from("chatbot_faq").select("*").order("created_at", { ascending: false }),
        supabase.from("chatbot_logs").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("knowledge_base").select("*").order("position", { ascending: true }),
      ]);
      if (settingsData) setSettings(normalizeChatbotSettings(settingsData as ChatbotSettings));
      setFaqs((faqData || []) as FAQ[]);
      setLogs((logsData || []) as ChatLog[]);
      setKnowledge((kbData || []) as KnowledgeEntry[]);
    } catch {
      toast.error("Failed to load chatbot data");
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("chatbot_settings")
        .update({
          system_prompt: settings.system_prompt,
          model: ACTIVE_CHATBOT_MODEL,
          temperature: settings.temperature,
          max_tokens: settings.max_tokens,
          enable_mock_help: settings.enable_mock_help,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
      if (error) throw error;
      toast.success("Chatbot settings saved!");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const addFaq = async () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) {
      toast.error("Question and answer are required");
      return;
    }
    setAddingFaq(true);
    try {
      const { data, error } = await supabase.from("chatbot_faq").insert(newFaq).select().single();
      if (error) throw error;
      setFaqs(prev => [data as FAQ, ...prev]);
      setNewFaq({ question: "", answer: "", category: "general" });
      toast.success("FAQ added!");
    } catch {
      toast.error("Failed to add FAQ");
    } finally {
      setAddingFaq(false);
    }
  };

  const toggleFaq = async (faq: FAQ) => {
    const { error } = await supabase.from("chatbot_faq").update({ is_active: !faq.is_active }).eq("id", faq.id);
    if (!error) setFaqs(prev => prev.map(f => f.id === faq.id ? { ...f, is_active: !f.is_active } : f));
  };

  const deleteFaq = async (id: string) => {
    const { error } = await supabase.from("chatbot_faq").delete().eq("id", id);
    if (!error) { setFaqs(prev => prev.filter(f => f.id !== id)); toast.success("FAQ deleted"); }
  };

  // Knowledge base CRUD
  const addKbEntry = async () => {
    if (!newKbEntry.title.trim() || !newKbEntry.content.trim()) {
      toast.error("Title aur content required hai");
      return;
    }
    setAddingKb(true);
    try {
      const keywords = newKbEntry.keywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);
      const { data, error } = await supabase
        .from("knowledge_base")
        .insert({
          category: newKbEntry.category,
          title: newKbEntry.title,
          content: newKbEntry.content,
          keywords,
          position: knowledge.length + 1,
        })
        .select()
        .single();
      if (error) throw error;
      setKnowledge(prev => [...prev, data as KnowledgeEntry]);
      setNewKbEntry({ category: 'platform_guide', title: '', content: '', keywords: '' });
      setShowAddKb(false);
      toast.success("Knowledge entry added! Sarthi ab yeh jaanta hai. 🧠");
    } catch {
      toast.error("Failed to add knowledge entry");
    } finally {
      setAddingKb(false);
    }
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditingId(entry.id);
    setEditData({
      title: entry.title,
      content: entry.content,
      category: entry.category,
      keywords: entry.keywords,
    });
  };

  const saveEdit = async (id: string) => {
    setSavingKb(true);
    try {
      const { error } = await supabase
        .from("knowledge_base")
        .update({
          title: editData.title,
          content: editData.content,
          category: editData.category,
          keywords: editData.keywords,
        })
        .eq("id", id);
      if (error) throw error;
      setKnowledge(prev => prev.map(k => k.id === id ? { ...k, ...editData } as KnowledgeEntry : k));
      setEditingId(null);
      toast.success("Knowledge updated! ✅");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSavingKb(false);
    }
  };

  const toggleKbEntry = async (entry: KnowledgeEntry) => {
    const { error } = await supabase
      .from("knowledge_base")
      .update({ is_active: !entry.is_active })
      .eq("id", entry.id);
    if (!error) setKnowledge(prev => prev.map(k => k.id === entry.id ? { ...k, is_active: !k.is_active } : k));
  };

  const deleteKbEntry = async (id: string) => {
    const { error } = await supabase.from("knowledge_base").delete().eq("id", id);
    if (!error) {
      setKnowledge(prev => prev.filter(k => k.id !== id));
      toast.success("Entry deleted");
    }
  };

  // Filter knowledge
  const filteredKnowledge = knowledge.filter(k => {
    const matchCat = kbCategory === 'all' || k.category === kbCategory;
    const matchSearch = !kbSearch || k.title.toLowerCase().includes(kbSearch.toLowerCase()) || k.content.toLowerCase().includes(kbSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const MODEL_OPTIONS = [ACTIVE_CHATBOT_MODEL];

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-muted/30 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
             <h1 className="text-2xl font-bold text-foreground">JSR COACHING Agent Settings</h1>
             <p className="text-sm text-muted-foreground">Your Intelligent Learning Companion – Configure the AI Agent</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <Tabs defaultValue="knowledge">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="settings"><Settings className="h-4 w-4 mr-1" />Settings</TabsTrigger>
            <TabsTrigger value="knowledge">
              <Brain className="h-4 w-4 mr-1" />
              Memory <Badge variant="secondary" className="ml-1 text-xs">{knowledge.filter(k => k.is_active).length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="crawler"><Globe className="h-4 w-4 mr-1" />Crawler</TabsTrigger>
            <TabsTrigger value="faq"><BookOpen className="h-4 w-4 mr-1" />FAQ ({faqs.filter(f => f.is_active).length})</TabsTrigger>
            <TabsTrigger value="logs"><MessageSquare className="h-4 w-4 mr-1" />Logs</TabsTrigger>
          </TabsList>

          {/* ============ Settings Tab ============ */}
          <TabsContent value="settings">
            {settings && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Model & Behavior</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>AI Model</Label>
                    <select
                      value={settings.model}
                      onChange={e => setSettings({ ...settings, model: e.target.value })}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    >
                      {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <p className="text-xs text-muted-foreground">Uses Lovable AI Gateway — no additional API key needed.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Temperature (0–1)</Label>
                      <Input
                        type="number" min="0" max="1" step="0.1"
                        value={settings.temperature}
                        onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">Lower = focused, Higher = creative</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Max Tokens (Response Length)</Label>
                      <Input
                        type="number" min="200" max="3000" step="100"
                        value={settings.max_tokens}
                        onChange={e => setSettings({ ...settings, max_tokens: parseInt(e.target.value) })}
                      />
                      <p className="text-xs text-muted-foreground">2000 = ~1500 words response (max 3000)</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Mock Test Help Mode</p>
                      <p className="text-xs text-muted-foreground">Give hints only, not direct answers</p>
                    </div>
                    <button onClick={() => setSettings({ ...settings, enable_mock_help: !settings.enable_mock_help })}>
                      {settings.enable_mock_help
                        ? <ToggleRight className="h-8 w-8 text-primary" />
                        : <ToggleLeft className="h-8 w-8 text-muted-foreground" />}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Label>System Prompt (Core Identity & Rules)</Label>
                    <Textarea
                      value={settings.system_prompt}
                      onChange={e => setSettings({ ...settings, system_prompt: e.target.value })}
                      rows={8}
                      className="font-mono text-xs"
                      placeholder="e.g. You are JSR COACHING Agent, a friendly English learning companion..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Core identity rules. Knowledge Base (Memory tab) is automatically injected as context when relevant.
                    </p>
                  </div>

                  <Button className="w-full" onClick={saveSettings} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Settings
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============ Knowledge Base (RAG Memory) Tab ============ */}
          <TabsContent value="knowledge" className="space-y-4">
            {/* Info Banner */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex gap-3">
              <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-foreground">RAG Memory System 🧠</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Yahan jo bhi information add karoge, JSR COACHING Agent automatically woh use karega relevant questions ke jawab mein.
                  Platform guide, courses, policies — sab kuch yahan manage karo bina code change kiye.
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {CATEGORIES.map(cat => {
                const count = knowledge.filter(k => k.category === cat.value).length;
                return (
                  <button
                    key={cat.value}
                    onClick={() => setKbCategory(kbCategory === cat.value ? 'all' : cat.value)}
                    className={`p-3 rounded-lg border text-left transition-all ${kbCategory === cat.value ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'}`}
                  >
                    <p className="text-xs text-muted-foreground">{cat.label}</p>
                    <p className="text-xl font-bold text-foreground">{count}</p>
                  </button>
                );
              })}
            </div>

            {/* Search + Add button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search knowledge entries..."
                  value={kbSearch}
                  onChange={e => setKbSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={() => setShowAddKb(!showAddKb)} variant={showAddKb ? "outline" : "default"}>
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            </div>

            {/* Add New Entry Form */}
            {showAddKb && (
              <Card className="border-primary/30 bg-primary/2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">New Knowledge Entry</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Category</Label>
                      <select
                        value={newKbEntry.category}
                        onChange={e => setNewKbEntry({ ...newKbEntry, category: e.target.value })}
                        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      >
                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Keywords (comma-separated)</Label>
                      <Input
                        placeholder="login, password, reset"
                        value={newKbEntry.keywords}
                        onChange={e => setNewKbEntry({ ...newKbEntry, keywords: e.target.value })}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Title</Label>
                    <Input
                      placeholder="e.g. Video Lecture Kaise Dekhein"
                      value={newKbEntry.title}
                      onChange={e => setNewKbEntry({ ...newKbEntry, title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Content (Hinglish/English/Hindi – Jo Sarthi bolega)</Label>
                    <Textarea
                      placeholder="Yahan platform ke baare mein information likho jo Sarthi students ko batayega..."
                      value={newKbEntry.content}
                      onChange={e => setNewKbEntry({ ...newKbEntry, content: e.target.value })}
                      rows={5}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={addKbEntry} disabled={addingKb} className="flex-1">
                      {addingKb ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
                      Add to Sarthi's Memory
                    </Button>
                    <Button variant="outline" onClick={() => setShowAddKb(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Knowledge Entries List */}
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {filteredKnowledge.length} entries
                  {kbCategory !== 'all' && <span className="text-sm font-normal text-muted-foreground ml-2">in {getCategoryLabel(kbCategory)}</span>}
                </CardTitle>
                {kbCategory !== 'all' && (
                  <Button variant="ghost" size="sm" onClick={() => setKbCategory('all')}>
                    <X className="h-3 w-3 mr-1" />Clear filter
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px] max-h-[calc(100dvh-260px)]">
                  {filteredKnowledge.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Brain className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Koi entry nahi mili</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredKnowledge.map(entry => (
                        <div key={entry.id} className="p-4">
                          {editingId === entry.id ? (
                            /* Edit Mode */
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={editData.category}
                                  onChange={e => setEditData({ ...editData, category: e.target.value })}
                                  className="border rounded px-2 py-1 text-sm bg-background"
                                >
                                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                                <Input
                                  placeholder="keywords (comma-sep)"
                                  value={(editData.keywords || []).join(', ')}
                                  onChange={e => setEditData({ ...editData, keywords: e.target.value.split(',').map(k => k.trim()) })}
                                  className="text-sm"
                                />
                              </div>
                              <Input
                                value={editData.title}
                                onChange={e => setEditData({ ...editData, title: e.target.value })}
                                className="font-medium text-sm"
                              />
                              <Textarea
                                value={editData.content}
                                onChange={e => setEditData({ ...editData, content: e.target.value })}
                                rows={5}
                                className="text-sm"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveEdit(entry.id)} disabled={savingKb}>
                                  {savingKb ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                                  <X className="h-3 w-3 mr-1" />Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            /* View Mode */
                            <div>
                              <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getCategoryStyle(entry.category)}`}>
                                      {getCategoryLabel(entry.category)}
                                    </span>
                                    {!entry.is_active && <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">Inactive</span>}
                                  </div>
                                  <p className="font-semibold text-sm text-foreground">{entry.title}</p>
                                  {entry.keywords.length > 0 && (
                                    <div className="flex gap-1 flex-wrap mt-1">
                                      {entry.keywords.slice(0, 5).map(kw => (
                                        <span key={kw} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">#{kw}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                                    className="p-1.5 hover:bg-muted rounded"
                                  >
                                    {expandedId === entry.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </button>
                                  <button onClick={() => startEdit(entry)} className="p-1.5 hover:bg-muted rounded" title="Edit">
                                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </button>
                                  <button onClick={() => toggleKbEntry(entry)} title="Toggle active" className="p-1.5 hover:bg-muted rounded">
                                    {entry.is_active
                                      ? <ToggleRight className="h-5 w-5 text-primary" />
                                      : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                                  </button>
                                  <button onClick={() => deleteKbEntry(entry.id)} className="p-1.5 hover:bg-muted rounded" title="Delete">
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </button>
                                </div>
                              </div>
                              {expandedId === entry.id && (
                                <div className="mt-3 bg-muted/40 rounded-lg p-3">
                                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                    {entry.content}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ Web Crawler (Firecrawl) Tab ============ */}
          <TabsContent value="crawler" className="space-y-4">
            {/* Status Banner — shows real status based on crawl attempt */}
            <div className="bg-secondary border border-border rounded-lg p-4 flex gap-3">
              <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-sm text-foreground">🔥 Firecrawl Web Crawler</p>
                <p className="text-xs text-muted-foreground">
                  Paste any public URL to scrape its content into Sarthi's memory. Status is verified when you crawl — if the API key is missing, you'll see an error.
                </p>
              </div>
            </div>

            {/* How it works info */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex gap-3">
              <Globe className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Firecrawl → Sarthi's Memory 🧠</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Koi bhi URL paste karo (NCERT chapter, study site, website page) → Firecrawl us page ka content scrape karega → automatically <strong>knowledge_base</strong> mein save hoga → Sarthi us content se answers dega.
                </p>
              </div>
            </div>

            {/* Crawl Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link className="h-4 w-4" />
                  Crawl URL & Add to Memory
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL to Crawl</Label>
                  <Input
                    placeholder="https://ncert.nic.in/textbook/pdf/leph101.pdf  or  https://example.com/chapter"
                    value={crawlUrl}
                    onChange={e => setCrawlUrl(e.target.value)}
                    disabled={crawling}
                  />
                  <p className="text-xs text-muted-foreground">NCERT pages, JSR COACHING website pages, study materials, current affairs — koi bhi public URL</p>
                </div>

                <div className="space-y-2">
                  <Label>Knowledge Category</Label>
                  <select
                    value={crawlCategory}
                    onChange={e => setCrawlCategory(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    disabled={crawling}
                  >
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <Button
                  className="w-full"
                  onClick={triggerCrawl}
                  disabled={crawling || !crawlUrl.trim()}
                >
                  {crawling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Crawling... (20-30 sec)
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4 mr-2" />
                      Crawl & Add to Sarthi's Memory
                    </>
                  )}
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline" className="flex-1" size="sm"
                    onClick={() => { void tapHaptic('light'); triggerFirecrawl(); }}
                    disabled={scrapingFC || crawling || !crawlUrl.trim()}
                    title="Fallback for JS-rendered pages (uses Firecrawl API)"
                  >
                    {scrapingFC ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Globe className="h-3.5 w-3.5 mr-1.5" />}
                    Try Firecrawl (JS-rendered)
                  </Button>
                  <Button
                    variant="outline" className="flex-1" size="sm"
                    onClick={() => { void tapHaptic('light'); backfillEmbeddings(); }}
                    disabled={embedBackfilling}
                    title="Generate embeddings for KB entries that don't have one yet (batch of 20)"
                  >
                    {embedBackfilling ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Brain className="h-3.5 w-3.5 mr-1.5" />}
                    Backfill embeddings
                  </Button>
                </div>

                {crawling && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-sm text-muted-foreground animate-pulse">🕷️ Page crawl ho raha hai... Headless browser page load kar raha hai...</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Crawl History */}
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Crawl History (Last 20)
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={fetchCrawlHistory} disabled={loadingHistory} aria-label="Refresh crawl history">
                  <RefreshCw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[360px]">
                  {crawlHistory.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Abhi tak koi URL crawl nahi kiya</p>
                      <p className="text-xs mt-1">Upar URL daalo aur crawl karo!</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {crawlHistory.map(entry => (
                        <div key={entry.id} className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {entry.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                              {entry.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" />}
                              {entry.status === 'pending' && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <a
                                  href={entry.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-medium text-primary hover:underline truncate max-w-xs flex items-center gap-1"
                                >
                                  {entry.title || new URL(entry.url).hostname}
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                                <Badge
                                  variant={entry.status === 'completed' ? 'default' : entry.status === 'failed' ? 'destructive' : 'secondary'}
                                  className="text-xs"
                                >
                                  {entry.status}
                                </Badge>
                                {entry.status === 'completed' && (
                                  <Badge variant="outline" className="text-xs">
                                    +{entry.knowledge_entries_created} entries
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 truncate">{entry.url}</p>
                              {entry.content_preview && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">"{entry.content_preview}"</p>
                              )}
                              {entry.error_message && (
                                <p className="text-xs text-destructive mt-1">❌ {entry.error_message}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(entry.crawled_at).toLocaleString('en-IN')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ FAQ Tab ============ */}
          <TabsContent value="faq" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Add New FAQ</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Question</Label>
                  <Input
                    value={newFaq.question}
                    onChange={e => setNewFaq({ ...newFaq, question: e.target.value })}
                    placeholder="e.g. How do I reset my password?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Answer</Label>
                  <Textarea
                    value={newFaq.answer}
                    onChange={e => setNewFaq({ ...newFaq, answer: e.target.value })}
                    rows={3}
                    placeholder="Provide a helpful answer..."
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newFaq.category}
                    onChange={e => setNewFaq({ ...newFaq, category: e.target.value })}
                    placeholder="Category (e.g. courses, payment)"
                    className="flex-1"
                  />
                  <Button onClick={addFaq} disabled={addingFaq}>
                    {addingFaq ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                    Add FAQ
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>FAQ Entries ({faqs.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px] max-h-[60vh]">
                  {faqs.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">No FAQs yet. Add some above!</div>
                  ) : (
                    <div className="divide-y">
                      {faqs.map(faq => (
                        <div key={faq.id} className="p-4 flex gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm">{faq.question}</p>
                              <Badge variant="outline" className="text-xs shrink-0">{faq.category}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{faq.answer}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => toggleFaq(faq)}>
                              {faq.is_active
                                ? <ToggleRight className="h-6 w-6 text-primary" />
                                : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                            </button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteFaq(faq.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ Logs Tab ============ */}
          <TabsContent value="logs">
            <Card>
              <CardHeader><CardTitle>Conversation Logs (Last 50)</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px] max-h-[calc(100dvh-260px)]">
                  {logs.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">No conversations logged yet.</div>
                  ) : (
                    <div className="divide-y">
                      {logs.map(log => (
                        <div key={log.id} className="p-4 space-y-2">
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString('en-IN')}
                            {log.user_id && <span className="ml-2 text-primary">· Logged in user</span>}
                          </p>
                          <div className="bg-primary/5 rounded-lg px-3 py-2">
                            <p className="text-xs text-muted-foreground mb-0.5">Student:</p>
                            <p className="text-sm">{log.message}</p>
                          </div>
                          <div className="bg-muted rounded-lg px-3 py-2">
                            <p className="text-xs text-muted-foreground mb-0.5">Sarthi:</p>
                            <p className="text-sm line-clamp-3">{log.response}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
};

export default ChatbotSettings;
