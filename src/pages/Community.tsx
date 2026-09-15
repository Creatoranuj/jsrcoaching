/**
 * Community.tsx — Admin-driven community feed with Notion page embeds,
 * member comments and likes. Notion pages are rendered IN-APP via
 * `NotionPageRenderer` (react-notion-x) — never as a raw notion.site iframe,
 * so the "Get Notion free" topbar / share menu never appear inside the app.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Layout/Header";
import Sidebar from "@/components/Layout/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import NotionPageRenderer from "@/components/video/NotionPageRenderer";
import {
  Plus, Pin, Heart, MessageCircle, Trash2,
  ExternalLink, Loader2, Users, Send, FileText,
} from "lucide-react";
import { isSyntheticPop } from "../lib/reader/overlayHistory";

type Post = {
  id: string;
  author_id: string;
  title: string;
  body: string | null;
  notion_url: string | null;
  is_pinned: boolean;
  created_at: string;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
};

/**
 * Convert a Notion "Share to web" page URL into the embeddable URL.
 * Notion's share URL works directly inside an iframe.
 */
/**
 * Normalise an admin-pasted Notion link.
 *
 * Accepts a plain Notion page URL (notion.site / notion.so). Returns `null`
 * for anything else. Iframe-embed snippets and notion.site/ebd|embed/ links
 * are **rejected** here so `validateNotionInput` can surface a precise error
 * before we persist a broken URL.
 */
function toNotionEmbedUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (!url.hostname.includes("notion.")) return null;
    if (/^\/(ebd|embed)(\/|$)/i.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Validate raw admin input. Returns `{ ok: true, url }` for a clean Notion
 * page link, or `{ ok: false, reason }` with a Hindi-English explanation
 * the admin can act on (paste iframe snippet → tell them to use plain link).
 */
type NotionInputResult =
  | { ok: true; url: string; reason?: undefined }
  | { ok: false; reason: string; url?: undefined };

function validateNotionInput(raw: string): NotionInputResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: "" };

  // Iframe embed snippet (e.g. `<iframe src="...">`). Auto-extract src and
  // tell the admin to paste the plain Notion page URL next time.
  if (/<iframe[\s>]/i.test(trimmed)) {
    return {
      ok: false,
      reason:
        "Iframe embed code mat paste karein — sirf plain Notion page link daalein (https://...notion.site/Page-Title-xxxxxxxx).",
    };
  }

  // notion.site/ebd/<id> or /embed/<id> — these are the embed-only URLs that
  // do not render inside the in-app NotionPageRenderer (no page slug → bad id).
  if (/notion\.(site|so)\/(ebd|embed)\//i.test(trimmed)) {
    return {
      ok: false,
      reason:
        "/ebd/ ya /embed/ wala link kaam nahi karega — Share → Copy link wala original Notion page URL paste karein.",
    };
  }

  const clean = toNotionEmbedUrl(trimmed);
  if (!clean) {
    return {
      ok: false,
      reason: "Notion URL me notion.so / notion.site domain hona chahiye.",
    };
  }
  return { ok: true, url: clean };
}

const Community = () => {
  const confirmAction = useConfirm();
  const navigate = useNavigate();
  const { user, isAdmin, isAuthenticated, isLoading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const PAGE_SIZE = 20;
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [likes, setLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // create post form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [pinned, setPinned] = useState(false);
  const [creating, setCreating] = useState(false);

  // comment input per post
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});

  // Fullscreen Notion preview overlay — opened from a post's preview tile.
  // Rendered via in-app NotionPageRenderer (NOT a notion.site iframe) so the
  // "Get Notion free" topbar / Notion branding never leaks into the app.
  const [notionPreview, setNotionPreview] = useState<{ url: string; title: string } | null>(null);
  useEffect(() => {
    if (!notionPreview) return;
    // Push a history sentinel so hardware back closes the preview, not the page.
    try { window.history.pushState({ pdfFullscreen: true }, ""); } catch {}
    const onPop = () => {
      // Ignore pops caused by a nested overlay closing itself.
      if (isSyntheticPop()) return;
      if (window.history.state?.pdfFullscreen) return;
      setNotionPreview(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [notionPreview]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);

  const hydrateAuxData = async (postsData: Post[]) => {
    const ids = postsData.map((p) => p.id);
    if (ids.length === 0) return;
    // AUDIT 2026-09-08 (SEC): reading community_reactions directly let any
    // signed-in user enumerate who liked what. Counts now come from the
    // get_post_reactions RPC, which returns only totals + "did I like it".
    const [{ data: cmts }, { data: reacts }] = await Promise.all([
      supabase.from("community_comments").select("*").in("post_id", ids).order("created_at"),
      (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { post_id: string; like_count: number; liked_by_me: boolean }[] | null }>)(
        "get_post_reactions",
        { _post_ids: ids },
      ),
    ]);
    setComments((prev) => {
      const grouped = { ...prev };
      (cmts ?? []).forEach((c) => {
        (grouped[c.post_id] ||= []).push(c as Comment);
      });
      return grouped;
    });
    setLikes((prev) => {
      const likeMap = { ...prev };
      ids.forEach((id) => { likeMap[id] ||= { count: 0, liked: false }; });
      (reacts ?? []).forEach((r) => {
        likeMap[r.post_id] = {
          count: Number(r.like_count ?? 0),
          liked: Boolean(r.liked_by_me),
        };
      });
      return likeMap;
    });
  };

  const loadAll = async () => {
    setLoading(true);
    // Keyset pagination: fetch first page ordered by (is_pinned desc, created_at desc).
    // Subsequent pages use `created_at < lastCursor` (`loadMore`).
    const { data: postsData, error } = await supabase
      .from("community_posts")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      toast.error("Failed to load community");
      setLoading(false);
      return;
    }
    const rows = (postsData ?? []) as Post[];
    setPosts(rows);
    setHasMore(rows.length === PAGE_SIZE);
    await hydrateAuxData(rows);
    setLoading(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    setLoadingMore(true);
    const cursor = posts[posts.length - 1].created_at;
    // Keyset cursor — avoids O(N) offset scans that break past 1k rows.
    const { data, error } = await supabase
      .from("community_posts")
      .select("*")
      .eq("is_pinned", false)
      .lt("created_at", cursor)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) {
      toast.error("Load more failed");
      setLoadingMore(false);
      return;
    }
    const rows = (data ?? []) as Post[];
    setPosts((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    await hydrateAuxData(rows);
    setLoadingMore(false);
  };


  useEffect(() => {
    if (isAuthenticated) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // Live validation feedback for the Notion URL field — empty when input is
  // empty or valid, error string otherwise. Prevents the admin from clicking
  // Publish only to be greeted with a toast.
  const notionValidation = validateNotionInput(notionUrl);
  const notionInputError: string | null = notionValidation.ok ? null : notionValidation.reason;

  const handleCreate = async () => {
    if (!user || !title.trim()) return;
    if (!notionValidation.ok) {
      toast.error(notionValidation.reason);
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("community_posts").insert({
      author_id: user.id,
      title: title.trim(),
      body: body.trim() || null,
      notion_url: notionUrl.trim() || null,
      is_pinned: pinned,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Post published");
    setTitle(""); setBody(""); setNotionUrl(""); setPinned(false);
    setShowCreate(false);
    loadAll();
  };

  const handleDeletePost = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this post?", variant: "destructive" }))) return;
    const { error } = await supabase.from("community_posts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    loadAll();
  };

  const handleToggleLike = async (postId: string) => {
    if (!user) return;
    const cur = likes[postId];
    if (cur?.liked) {
      await supabase.from("community_reactions").delete()
        .eq("post_id", postId).eq("user_id", user.id);
      setLikes(s => ({ ...s, [postId]: { count: Math.max(0, (s[postId]?.count ?? 1) - 1), liked: false } }));
    } else {
      await supabase.from("community_reactions").insert({ post_id: postId, user_id: user.id });
      setLikes(s => ({ ...s, [postId]: { count: (s[postId]?.count ?? 0) + 1, liked: true } }));
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!user) return;
    const text = (commentDraft[postId] ?? "").trim();
    if (!text) return;
    const userName = user.fullName || user.email?.split("@")[0] || "Member";
    const { data, error } = await supabase.from("community_comments").insert({
      post_id: postId, user_id: user.id, user_name: userName, body: text,
    }).select().single();
    if (error) return toast.error(error.message);
    setCommentDraft(d => ({ ...d, [postId]: "" }));
    setComments(c => ({ ...c, [postId]: [...(c[postId] ?? []), data as Comment] }));
  };

  const handleDeleteComment = async (commentId: string, postId: string) => {
    const { error } = await supabase.from("community_comments").delete().eq("id", commentId);
    if (error) return toast.error(error.message);
    setComments(c => ({ ...c, [postId]: (c[postId] ?? []).filter(x => x.id !== commentId) }));
  };

  const sortedPosts = useMemo(() => posts, [posts]);

  return (
    <div className="min-h-dvh bg-background">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" /> Community
              </h1>
              <p className="text-sm text-muted-foreground">Announcements, Notion pages and discussions</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreate(s => !s)}>
              <Plus className="h-4 w-4 mr-1" /> New Post
            </Button>
          )}
        </div>

        {isAdmin && showCreate && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-lg">Create Post</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
              <Textarea placeholder="Message (optional)" rows={3} value={body} onChange={e => setBody(e.target.value)} />
              <Input
                placeholder="Notion page URL (https://...notion.site/Page-Title-xxxxxx)"
                value={notionUrl}
                onChange={e => setNotionUrl(e.target.value)}
                aria-invalid={notionInputError ? true : undefined}
                className={notionInputError ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {notionInputError ? (
                <p className="text-xs text-destructive">{notionInputError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Notion page ko "Share → Copy link" karke <strong>plain URL</strong> paste karein. <code className="text-[10px]">&lt;iframe&gt;</code> embed code ya <code className="text-[10px]">/ebd/</code> link <strong>kaam nahi karega</strong>.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
                <Pin className="h-3 w-3" /> Pin to top
              </label>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || !title.trim()}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : sortedPosts.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            Abhi tak koi post nahi. {isAdmin && "Pehla post add karein."}
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {sortedPosts.map(post => {
              const embedUrl = post.notion_url ? toNotionEmbedUrl(post.notion_url) : null;
              const postLikes = likes[post.id] ?? { count: 0, liked: false };
              const postComments = comments[post.id] ?? [];
              const isOpen = openComments[post.id];
              return (
                <Card key={post.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          {post.is_pinned && <Pin className="h-4 w-4 text-primary" />}
                          {post.title}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {new Date(post.created_at).toLocaleDateString()}
                          </Badge>
                          {post.notion_url && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <ExternalLink className="h-3 w-3" /> Notion
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <Button aria-label="Delete post" variant="ghost" size="icon" onClick={() => handleDeletePost(post.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {post.body && <p className="text-sm whitespace-pre-wrap">{post.body}</p>}

                    {embedUrl && (
                      <button
                        type="button"
                        onClick={() => setNotionPreview({ url: embedUrl, title: post.title })}
                        className="w-full text-left border rounded-lg overflow-hidden bg-muted/30 hover:bg-muted/50 transition active:scale-[0.997]"
                      >
                        <div className="flex items-center gap-3 px-4 py-4">
                          <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground line-clamp-1">{post.title}</p>
                            <p className="text-xs text-muted-foreground">Tap to open Notion page in app</p>
                          </div>
                          <span className="text-xs text-primary font-medium">Open</span>
                        </div>
                      </button>
                    )}

                    <div className="flex items-center gap-4 pt-1">
                      <button
                        onClick={() => handleToggleLike(post.id)}
                        className={`inline-flex items-center gap-1 text-sm transition ${postLikes.liked ? "text-red-500" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Heart className={`h-4 w-4 ${postLikes.liked ? "fill-current" : ""}`} />
                        {postLikes.count}
                      </button>
                      <button
                        onClick={() => setOpenComments(s => ({ ...s, [post.id]: !s[post.id] }))}
                        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                      >
                        <MessageCircle className="h-4 w-4" /> {postComments.length}
                      </button>
                    </div>

                    {isOpen && (
                      <div className="border-t pt-3 space-y-2">
                        {postComments.map(c => (
                          <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                            <div>
                              <span className="font-medium">{c.user_name}</span>{" "}
                              <span className="text-muted-foreground">{c.body}</span>
                            </div>
                            {(c.user_id === user?.id || isAdmin) && (
                              <button
                                onClick={() => handleDeleteComment(c.id, post.id)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Input
                            placeholder="Comment likhein..."
                            value={commentDraft[post.id] ?? ""}
                            onChange={e => setCommentDraft(d => ({ ...d, [post.id]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && handleAddComment(post.id)}
                          />
                          <Button aria-label="Post comment" size="icon" onClick={() => handleAddComment(post.id)}>
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {hasMore && (
              <div className="pt-2 pb-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="min-w-[10rem]"
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
                </Button>
              </div>
            )}
          </div>
        )}
      </main>


      {/* Fullscreen in-app Notion preview overlay.
          NotionPageRenderer ships its own minimal top-left exit arrow that
          calls history.back() → triggers the popstate listener above and
          closes this overlay (returns the user to the Community feed). */}
      {notionPreview && (
        <div className="fixed inset-0 z-[100] bg-background safe-area-top">
          <NotionPageRenderer url={notionPreview.url} title={notionPreview.title} />
        </div>
      )}
    </div>
  );
};

export default Community;