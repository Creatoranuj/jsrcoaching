import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Layout/Header";
import Sidebar from "@/components/Layout/Sidebar";
import BackButton from "@/components/ui/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Trash2, Upload, Link as LinkIcon, FileText, Pencil, X, Save } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import {
  useStudyMaterials,
  type StudyMaterial,
  type StudyMaterialKind,
} from "@/hooks/useStudyMaterials";
import { useQueryClient } from "@tanstack/react-query";
import { verifyShareAccess } from "@/lib/shareAccessCheck";

const BUCKET = "study-materials";
const MAX_BYTES = 20 * 1024 * 1024; // 20MB

const MIME_TO_KIND: Array<{ test: RegExp; kind: StudyMaterialKind }> = [
  { test: /^application\/pdf$/, kind: "pdf" },
  { test: /^image\//, kind: "image" },
  { test: /wordprocessingml|presentationml|spreadsheetml|msword|ms-excel|ms-powerpoint/, kind: "doc" },
];

function inferKind(mime: string): StudyMaterialKind {
  for (const m of MIME_TO_KIND) if (m.test.test(mime)) return m.kind;
  return "doc";
}

export default function AdminStudyMaterials() {
  const { user, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [chapters, setChapters] = useState<{ id: string; title: string; course_id: number }[]>([]);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [chapterId, setChapterId] = useState<string>(""); // "" = batch-wide
  const [mode, setMode] = useState<"file" | "link">("file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // ── Inline edit state ──────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editChapterId, setEditChapterId] = useState<string>("");
  const [editExternalUrl, setEditExternalUrl] = useState("");
  const [editReplaceFile, setEditReplaceFile] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const { data: materials, isLoading, refetch } = useStudyMaterials(courseId);

  useEffect(() => {
    if (authLoading) return;
    if (!user || (role !== "admin" && role !== "teacher")) {
      navigate("/", { replace: true });
    }
  }, [user, role, authLoading, navigate]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("courses")
      .select("id, title")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setCourses((data ?? []) as { id: number; title: string }[]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    supabase
      .from("chapters")
      .select("id, title, course_id")
      .eq("course_id", courseId)
      .order("position", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setChapters((data ?? []) as { id: string; title: string; course_id: number }[]);
      });
    setChapterId("");
    return () => { cancelled = true; };
  }, [courseId]);

  const chapterOptions = useMemo(
    () => chapters.filter((c) => c.course_id === courseId),
    [chapters, courseId],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId) return toast.error("Pick a course first");
    if (!title.trim()) return toast.error("Add a title");
    if (mode === "link" && !/^https?:\/\//i.test(externalUrl.trim())) {
      return toast.error("Link must start with http:// or https://");
    }
    // Drive/Docs/Notion pre-flight: catches "Restricted" files before they
    // land in the DB and blank-screen the reader for every student.
    if (mode === "link") {
      const check = await verifyShareAccess(externalUrl.trim());
      if (check.ok === false) {
        toast.error(check.reason, { description: check.hint, duration: 8000 });
        return;
      }
      if (check.warning) toast.warning(check.warning, { duration: 5000 });
      if (check.warning) toast.warning(check.warning, { duration: 5000 });
    }
    if (mode === "file" && !file) return toast.error("Choose a file to upload");
    if (mode === "file" && file && file.size > MAX_BYTES) {
      return toast.error("File too large (max 20MB)");
    }

    setUploading(true);
    try {
      let fileUrl: string | null = null;
      let mimeType: string | null = null;
      let size: number | null = null;
      let kind: StudyMaterialKind = "link";

      if (mode === "file" && file) {
        const safeName = file.name.replace(/[^\w.-]+/g, "_");
        const path = `${courseId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        fileUrl = `${BUCKET}/${path}`;
        mimeType = file.type || "application/octet-stream";
        size = file.size;
        kind = inferKind(mimeType);
      }

      const { error: insErr } = await supabase.from("study_materials").insert({
        course_id: courseId,
        chapter_id: chapterId || null,
        title: title.trim(),
        description: description.trim() || null,
        kind,
        file_url: fileUrl,
        external_url: mode === "link" ? externalUrl.trim() : null,
        file_size: size,
        mime_type: mimeType,
        sort_order: 0,
        created_by: user?.id ?? null,
      });
      if (insErr) throw insErr;

      toast.success("Study material added");
      setTitle("");
      setDescription("");
      setFile(null);
      setExternalUrl("");
      qc.invalidateQueries({ queryKey: ["study-materials", courseId] });
      void refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(m: StudyMaterial) {
    if (!confirm(`Delete "${m.title}"?`)) return;
    try {
      if (m.file_url) {
        const [bucket, ...rest] = m.file_url.split("/");
        await supabase.storage.from(bucket).remove([rest.join("/")]);
      }
      const { error } = await supabase.from("study_materials").delete().eq("id", m.id);
      if (error) throw error;
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["study-materials", courseId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg);
    }
  }

  function beginEdit(m: StudyMaterial) {
    setEditingId(m.id);
    setEditTitle(m.title);
    setEditDescription(m.description ?? "");
    setEditChapterId(m.chapter_id ?? "");
    setEditExternalUrl(m.external_url ?? "");
    setEditReplaceFile(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditReplaceFile(null);
  }

  async function saveEdit(m: StudyMaterial) {
    if (!editTitle.trim()) return toast.error("Title is required");
    if (m.kind === "link" && editExternalUrl && !/^https?:\/\//i.test(editExternalUrl.trim())) {
      return toast.error("Link must start with http:// or https://");
    }
    if (m.kind === "link" && editExternalUrl.trim()) {
      const check = await verifyShareAccess(editExternalUrl.trim());
      if (check.ok === false) {
        toast.error(check.reason, { description: check.hint, duration: 8000 });
        return;
      }
    }
    if (editReplaceFile && editReplaceFile.size > MAX_BYTES) {
      return toast.error("File too large (max 20MB)");
    }
    setSavingEdit(true);
    try {
      const patch: {
        title: string;
        description: string | null;
        chapter_id: string | null;
        external_url?: string | null;
        file_url?: string;
        mime_type?: string;
        file_size?: number;
        kind?: StudyMaterialKind;
      } = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        chapter_id: editChapterId || null,
      };
      if (m.kind === "link") {
        patch.external_url = editExternalUrl.trim() || null;
      }
      // Optional: replace the underlying file for file-backed materials.
      if (editReplaceFile && m.kind !== "link") {
        const safeName = editReplaceFile.name.replace(/[^\w.-]+/g, "_");
        const path = `${m.course_id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, editReplaceFile, { upsert: false, contentType: editReplaceFile.type });
        if (upErr) throw upErr;
        // Best-effort remove the old object.
        if (m.file_url) {
          const [oldBucket, ...rest] = m.file_url.split("/");
          await supabase.storage.from(oldBucket).remove([rest.join("/")]).catch(() => undefined);
        }
        patch.file_url = `${BUCKET}/${path}`;
        patch.mime_type = editReplaceFile.type || "application/octet-stream";
        patch.file_size = editReplaceFile.size;
        patch.kind = inferKind(patch.mime_type);
      }
      const { error } = await supabase.from("study_materials").update(patch).eq("id", m.id);
      if (error) throw error;
      toast.success("Updated");
      cancelEdit();
      qc.invalidateQueries({ queryKey: ["study-materials", courseId] });
      void refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      toast.error(msg);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="min-h-dvh bg-muted/30 flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <main className="flex-1 px-4 md:px-6 py-4 max-w-4xl w-full mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <BackButton />
          <h1 className="text-xl font-bold text-foreground">Study Materials</h1>
        </div>

        {/* Upload form */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("file")}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-sm transition-colors ${
                  mode === "file"
                    ? "bg-foreground text-background font-medium"
                    : "border border-border/60 bg-background text-foreground/70"
                }`}
              >
                <FileText className="h-3.5 w-3.5" /> File
              </button>
              <button
                type="button"
                onClick={() => setMode("link")}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-sm transition-colors ${
                  mode === "link"
                    ? "bg-foreground text-background font-medium"
                    : "border border-border/60 bg-background text-foreground/70"
                }`}
              >
                <LinkIcon className="h-3.5 w-3.5" /> Link
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>Course</Label>
                  <Select
                    value={courseId ? String(courseId) : ""}
                    onValueChange={(v) => setCourseId(Number(v))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                    <SelectContent>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Chapter (optional — leave blank for batch-wide)</Label>
                  <Select value={chapterId || "__batch"} onValueChange={(v) => setChapterId(v === "__batch" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Batch-wide" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__batch">Batch-wide (all chapters)</SelectItem>
                      {chapterOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Title</Label>
                <Input
                  className="text-base"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Unit 1 — Practice worksheet"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea
                  className="text-base"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              {mode === "file" ? (
                <div>
                  <Label>File (PDF, DOCX, PPTX, XLSX, JPG/PNG/WebP — max 20MB)</Label>
                  <Input
                    className="text-base"
                    type="file"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/jpeg,image/png,image/webp"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              ) : (
                <div>
                  <Label>External URL</Label>
                  <Input
                    className="text-base"
                    type="url"
                    inputMode="url"
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              )}

              <Button type="submit" disabled={uploading} className="w-full">
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Add material</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Existing list */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            Existing materials {courseId ? `(${materials?.length ?? 0})` : ""}
          </h2>
          {!courseId ? (
            <EmptyState title="Pick a course" description="Select a course above to see its materials." />
          ) : isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !materials || materials.length === 0 ? (
            <EmptyState title="Nothing uploaded yet" description="Add your first PDF, doc, image, or link above." />
          ) : (
            <ul className="space-y-2">
              {materials.map((m) => (
                <li key={m.id} className="p-3 rounded-xl border bg-card">
                  {editingId === m.id ? (
                    <div className="space-y-3">
                      <div>
                        <Label>Title</Label>
                        <Input className="text-base" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea className="text-base" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
                      </div>
                      <div>
                        <Label>Chapter</Label>
                        <Select value={editChapterId || "__batch"} onValueChange={(v) => setEditChapterId(v === "__batch" ? "" : v)}>
                          <SelectTrigger><SelectValue placeholder="Batch-wide" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__batch">Batch-wide (all chapters)</SelectItem>
                            {chapterOptions.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {m.kind === "link" ? (
                        <div>
                          <Label>External URL</Label>
                          <Input className="text-base" type="url" value={editExternalUrl} onChange={(e) => setEditExternalUrl(e.target.value)} />
                        </div>
                      ) : (
                        <div>
                          <Label>Replace file (optional, max 20MB)</Label>
                          <Input
                            className="text-base"
                            type="file"
                            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/jpeg,image/png,image/webp"
                            onChange={(e) => setEditReplaceFile(e.target.files?.[0] ?? null)}
                          />
                          {editReplaceFile && (
                            <p className="text-[11px] text-muted-foreground mt-1 truncate">
                              New: {editReplaceFile.name}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(m)} disabled={savingEdit}>
                          {savingEdit ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
                          ) : (
                            <><Save className="h-3.5 w-3.5 mr-1.5" /> Save</>
                          )}
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit} disabled={savingEdit}>
                          <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                        <p className="text-[11px] text-foreground/60">
                          {m.kind.toUpperCase()} · {m.chapter_id ? "chapter" : "batch-wide"}
                        </p>
                        {m.description && (
                          <p className="text-[11px] text-foreground/70 mt-1 line-clamp-2">{m.description}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => beginEdit(m)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(m)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
