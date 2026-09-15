import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "../../integrations/supabase/client";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  detectFileType,
  fileTypeOptions,
  type MaterialFileType,
} from "@/lib/detectFileType";
import { verifyShareAccess } from "@/lib/shareAccessCheck";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Library,
  FileText,
  BookOpen,
  Plus,
  Trash2,
  ExternalLink,
  Filter,
  Upload,
  Eye,
  CheckCircle,
} from "lucide-react";

interface Course {
  id: number;
  title: string;
}

interface LibraryManagerProps {
  /**
   * Courses list owned by the parent Admin page. Passed in (rather than
   * fetched again) so the existing dashboard data flow stays single-source.
   */
  coursesList: Course[];
}

/**
 * LibraryManager
 * ----------------------------------------------------------------------------
 * Extracted from Admin.tsx (was ~237 lines of inline JSX + 13 state slices +
 * 7 handlers living in the Admin component body). Wrapping in `React.memo`
 * with a stable prop surface (only `coursesList`) means tab switches inside
 * Admin no longer re-render this subtree at all — matches the pattern set by
 * `EnrollmentManager`.
 *
 * Why state was lifted DOWN (not threaded as props):
 *  - All 13 library state slices were referenced ONLY inside the library tab.
 *  - Threading them as props would defeat memo (each setter is a new ref).
 *  - `lessons`/`libraryLessons` were identical and only consumed here.
 *
 * Side-effect contract: fetches materials, notes, and lessons on mount. The
 * parent no longer needs to call `fetchLibraryData()` from `fetchDashboardData`
 * or on the Tabs `onValueChange` — mount-on-demand (`activeTab === 'library'`)
 * already gates this, so a fresh fetch happens every time the operator opens
 * the tab.
 */
function LibraryManagerImpl({ coursesList }: LibraryManagerProps) {
  const confirmAction = useConfirm();

  const [libraryLessons, setLibraryLessons] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<
    "all" | "VIDEO" | "PDF" | "DPP" | "NOTES" | "TEST"
  >("all");
  const [libraryCourseFilter, setLibraryCourseFilter] = useState<string>("all");
  const [materialsList, setMaterialsList] = useState<any[]>([]);
  const [notesList, setNotesList] = useState<any[]>([]);
  const [newMaterial, setNewMaterial] = useState({
    title: "",
    description: "",
    file_url: "",
    course_id: "",
  });
  const [materialFileType, setMaterialFileType] =
    useState<MaterialFileType>("PDF");
  const [newNote, setNewNote] = useState({
    title: "",
    pdf_url: "",
    lesson_id: "",
  });
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(
    null
  );
  const [editMaterialData, setEditMaterialData] = useState({
    title: "",
    description: "",
    file_url: "",
  });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteData, setEditNoteData] = useState({ title: "", pdf_url: "" });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [noteFile, setNoteFile] = useState<File | null>(null);

  const fetchLibraryData = async () => {
    const { data: mats } = await supabase
      .from("materials")
      .select("*, courses(title)")
      .order("created_at", { ascending: false });
    if (mats) setMaterialsList(mats);
    const { data: nts } = await supabase
      .from("notes")
      .select("*, lessons(title)")
      .order("created_at", { ascending: false });
    if (nts) setNotesList(nts);
    const { data: lessonItems } = await supabase
      .from("lessons")
      .select("*, courses(title)")
      .order("created_at", { ascending: false });
    if (lessonItems) {
      setLibraryLessons(lessonItems);
      setLessons(lessonItems);
    }
  };

  useEffect(() => {
    fetchLibraryData();
  }, []);

  const filteredLibraryLessons = useMemo(
    () =>
      libraryLessons.filter((l) => {
        const matchesType =
          libraryTypeFilter === "all" || l.lecture_type === libraryTypeFilter;
        const matchesCourse =
          libraryCourseFilter === "all" ||
          String(l.course_id) === libraryCourseFilter;
        return matchesType && matchesCourse;
      }),
    [libraryLessons, libraryTypeFilter, libraryCourseFilter]
  );

  const handleCreateMaterial = async () => {
    if (!newMaterial.title || !newMaterial.file_url)
      return toast.error("Title and URL required");
    let access;
    try {
      access = await verifyShareAccess(newMaterial.file_url);
    } catch {
      access = { ok: true as const, kind: "drive" as const, warning: "Share check failed — link saved unverified" };
    }
    if (access.ok === false) {
      toast.error(access.reason, { description: access.hint, duration: 8000 });
      return;
    }
    if (access.warning) {
      toast.warning(access.warning, { duration: 5000 });
    }
    if (access.warning) {
      toast.warning(access.warning, { duration: 5000 });
    }
    const { error } = await supabase.from("materials").insert({
      title: newMaterial.title,
      description: newMaterial.description || null,
      file_url: newMaterial.file_url,
      file_type: materialFileType,
      course_id: newMaterial.course_id ? parseInt(newMaterial.course_id) : null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Material added!");
      setNewMaterial({ title: "", description: "", file_url: "", course_id: "" });
      setMaterialFileType("PDF");
      fetchLibraryData();
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (
      !(await confirmAction({
        title: "Delete this material?",
        variant: "destructive",
      }))
    )
      return;
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (!error) {
      toast.success("Deleted");
      fetchLibraryData();
    }
  };

  const handleSaveMaterialEdit = async () => {
    if (!editingMaterialId) return;
    let access;
    try {
      access = await verifyShareAccess(editMaterialData.file_url);
    } catch {
      access = { ok: true as const, kind: "drive" as const, warning: "Share check failed — link saved unverified" };
    }
    if (access.ok === false) {
      toast.error(access.reason, { description: access.hint, duration: 8000 });
      return;
    }
    const { error } = await supabase
      .from("materials")
      .update({
        title: editMaterialData.title,
        description: editMaterialData.description,
        file_url: editMaterialData.file_url,
      })
      .eq("id", editingMaterialId);
    if (error) toast.error(error.message);
    else {
      toast.success("Updated!");
      setEditingMaterialId(null);
      fetchLibraryData();
    }
  };

  const handleCreateNote = async () => {
    if (!newNote.title || !newNote.pdf_url)
      return toast.error("Title and PDF URL required");
    const { error } = await supabase.from("notes").insert({
      title: newNote.title,
      pdf_url: newNote.pdf_url,
      lesson_id: newNote.lesson_id || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Note added!");
      setNewNote({ title: "", pdf_url: "", lesson_id: "" });
      fetchLibraryData();
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (
      !(await confirmAction({
        title: "Delete this note?",
        variant: "destructive",
      }))
    )
      return;
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (!error) {
      toast.success("Deleted");
      fetchLibraryData();
    }
  };

  const handleSaveNoteEdit = async () => {
    if (!editingNoteId) return;
    const { error } = await supabase
      .from("notes")
      .update({ title: editNoteData.title, pdf_url: editNoteData.pdf_url })
      .eq("id", editingNoteId);
    if (error) toast.error(error.message);
    else {
      toast.success("Updated!");
      setEditingNoteId(null);
      fetchLibraryData();
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Library className="h-5 w-5 text-primary" /> All Uploaded Content (
              {filteredLibraryLessons.length})
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={libraryTypeFilter}
                onValueChange={(v: any) => setLibraryTypeFilter(v)}
              >
                <SelectTrigger className="w-[130px] bg-card">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="VIDEO">Video</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="DPP">DPP</SelectItem>
                  <SelectItem value="NOTES">Notes</SelectItem>
                  <SelectItem value="TEST">Test</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={libraryCourseFilter}
                onValueChange={(v) => setLibraryCourseFilter(v)}
              >
                <SelectTrigger className="w-[180px] bg-card">
                  <SelectValue placeholder="All Courses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  {coursesList.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[300px]">
            {filteredLibraryLessons.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No content found.
              </div>
            ) : (
              <div className="divide-y">
                {filteredLibraryLessons.map((l: any) => (
                  <div
                    key={l.id}
                    className="p-4 hover:bg-muted/30 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-sm">{l.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.courses?.title || "No course"} •{" "}
                        <Badge variant="outline" className="text-xs">
                          {l.lecture_type || "VIDEO"}
                        </Badge>
                      </p>
                    </div>
                    {l.video_url && (
                      <a
                        href={l.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="icon" variant="ghost" aria-label={`Open video for ${l.title} in a new tab`}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Materials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Materials (PDF / Links)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <Input
                value={newMaterial.title}
                onChange={(e) =>
                  setNewMaterial({ ...newMaterial, title: e.target.value })
                }
                placeholder="Material title *"
              />
              <Select
                value={materialFileType}
                onValueChange={(v) => setMaterialFileType(v as MaterialFileType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="File Type" />
                </SelectTrigger>
                <SelectContent>
                  {fileTypeOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.icon} {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={!pdfFile ? "default" : "outline"}
                  onClick={() => setPdfFile(null)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Paste Link
                </Button>
                <Button
                  size="sm"
                  variant={pdfFile ? "default" : "outline"}
                  onClick={() =>
                    document.getElementById("library-file-upload")?.click()
                  }
                >
                  <Upload className="h-3 w-3 mr-1" /> Upload File
                </Button>
              </div>
              {!pdfFile && (
                <div className="space-y-1.5">
                  <Input
                    value={newMaterial.file_url}
                    onChange={(e) => {
                      const url = e.target.value;
                      setNewMaterial({ ...newMaterial, file_url: url });
                      if (url.length > 8) setMaterialFileType(detectFileType(url));
                    }}
                    placeholder="Paste any link — Google Drive / Docs / Sheets / Dropbox / YouTube / PDF URL"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Type auto-detects from the link. Override above if needed.
                  </p>
                </div>
              )}
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.png,.jpg,.jpeg,.webp"
                id="library-file-upload"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPdfFile(file);
                }}
              />
              {pdfFile && (
                <div className="flex items-center gap-2 p-2 bg-muted rounded border text-sm">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-medium truncate">{pdfFile.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 text-destructive"
                    onClick={() => setPdfFile(null)}
                  >
                    ✕
                  </Button>
                </div>
              )}
              <Textarea
                value={newMaterial.description}
                onChange={(e) =>
                  setNewMaterial({
                    ...newMaterial,
                    description: e.target.value,
                  })
                }
                placeholder="Description (optional)"
                rows={2}
              />
              <Select
                value={newMaterial.course_id || "__none__"}
                onValueChange={(v) =>
                  setNewMaterial({
                    ...newMaterial,
                    course_id: v === "__none__" ? "" : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Link to Course (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Course</SelectItem>
                  {coursesList.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="w-full"
                onClick={async () => {
                  if (pdfFile) {
                    const fileExt = pdfFile.name.split(".").pop();
                    const fileName = `${Date.now()}_${Math.random()
                      .toString(36)
                      .substring(7)}.${fileExt}`;
                    const filePath = `materials/${fileName}`;
                    const { error: uploadError } = await supabase.storage
                      .from("content")
                      .upload(filePath, pdfFile);
                    if (uploadError) {
                      toast.error(uploadError.message);
                      return;
                    }
                    await supabase.from("materials").insert({
                      title: newMaterial.title,
                      description: newMaterial.description || null,
                      file_url: `storage://content/${filePath}`,
                      file_type: materialFileType,
                      course_id: newMaterial.course_id
                        ? parseInt(newMaterial.course_id)
                        : null,
                    });
                    toast.success("Material uploaded!");
                    setPdfFile(null);
                    setNewMaterial({
                      title: "",
                      description: "",
                      file_url: "",
                      course_id: "",
                    });
                    setMaterialFileType("PDF");
                    fetchLibraryData();
                  } else handleCreateMaterial();
                }}
              >
                <Plus className="h-3 w-3 mr-1" />{" "}
                {pdfFile
                  ? `Upload & Add ${materialFileType}`
                  : `Add ${materialFileType}`}
              </Button>
            </div>
            <ScrollArea className="h-[350px]">
              <div className="space-y-2">
                {materialsList.map((m) => (
                  <div key={m.id} className="p-3 border rounded bg-card">
                    {editingMaterialId === m.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editMaterialData.title}
                          onChange={(e) =>
                            setEditMaterialData({
                              ...editMaterialData,
                              title: e.target.value,
                            })
                          }
                        />
                        <Input
                          value={editMaterialData.file_url}
                          onChange={(e) =>
                            setEditMaterialData({
                              ...editMaterialData,
                              file_url: e.target.value,
                            })
                          }
                        />
                        <Textarea
                          value={editMaterialData.description}
                          onChange={(e) =>
                            setEditMaterialData({
                              ...editMaterialData,
                              description: e.target.value,
                            })
                          }
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveMaterialEdit}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingMaterialId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{m.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.courses?.title || "No course"} • {m.file_type}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingMaterialId(m.id);
                              setEditMaterialData({
                                title: m.title,
                                description: m.description || "",
                                file_url: m.file_url,
                              });
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-400"
                            onClick={() => handleDeleteMaterial(m.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {materialsList.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No materials yet.
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <Input
                value={newNote.title}
                onChange={(e) =>
                  setNewNote({ ...newNote, title: e.target.value })
                }
                placeholder="Note title"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={!noteFile ? "default" : "outline"}
                  onClick={() => setNoteFile(null)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Paste Link
                </Button>
                <Button
                  size="sm"
                  variant={noteFile ? "default" : "outline"}
                  onClick={() =>
                    document.getElementById("note-file-upload")?.click()
                  }
                >
                  <Upload className="h-3 w-3 mr-1" /> Upload PDF
                </Button>
              </div>
              {!noteFile && (
                <Input
                  value={newNote.pdf_url}
                  onChange={(e) =>
                    setNewNote({ ...newNote, pdf_url: e.target.value })
                  }
                  placeholder="PDF URL"
                />
              )}
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                id="note-file-upload"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setNoteFile(file);
                }}
              />
              {noteFile && (
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200 text-sm text-green-700">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium truncate">{noteFile.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 text-red-500"
                    onClick={() => setNoteFile(null)}
                  >
                    ✕
                  </Button>
                </div>
              )}
              <Select
                value={newNote.lesson_id || "__none__"}
                onValueChange={(v) =>
                  setNewNote({
                    ...newNote,
                    lesson_id: v === "__none__" ? "" : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Link to Lesson (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Lesson</SelectItem>
                  {lessons.slice(0, 50).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="w-full"
                onClick={async () => {
                  if (noteFile) {
                    if (!newNote.title) {
                      toast.error("Note title is required");
                      return;
                    }
                    const fileExt = noteFile.name.split(".").pop();
                    const fileName = `notes/${Date.now()}_${Math.random()
                      .toString(36)
                      .substring(7)}.${fileExt}`;
                    const { error: uploadError } = await supabase.storage
                      .from("content")
                      .upload(fileName, noteFile);
                    if (uploadError) {
                      toast.error(uploadError.message);
                      return;
                    }
                    await supabase.from("notes").insert({
                      title: newNote.title,
                      pdf_url: `storage://content/${fileName}`,
                      lesson_id: newNote.lesson_id || null,
                    });
                    toast.success("Note uploaded!");
                    setNoteFile(null);
                    setNewNote({ title: "", pdf_url: "", lesson_id: "" });
                    fetchLibraryData();
                  } else handleCreateNote();
                }}
              >
                <Plus className="h-3 w-3 mr-1" />{" "}
                {noteFile ? "Upload & Add Note" : "Add Note"}
              </Button>
            </div>
            <ScrollArea className="h-[350px]">
              <div className="space-y-2">
                {notesList.map((n) => (
                  <div key={n.id} className="p-3 border rounded bg-card">
                    {editingNoteId === n.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editNoteData.title}
                          onChange={(e) =>
                            setEditNoteData({
                              ...editNoteData,
                              title: e.target.value,
                            })
                          }
                        />
                        <Input
                          value={editNoteData.pdf_url}
                          onChange={(e) =>
                            setEditNoteData({
                              ...editNoteData,
                              pdf_url: e.target.value,
                            })
                          }
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveNoteEdit}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingNoteId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{n.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {n.lessons?.title || "No lesson linked"}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingNoteId(n.id);
                              setEditNoteData({
                                title: n.title,
                                pdf_url: n.pdf_url,
                              });
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-400"
                            onClick={() => handleDeleteNote(n.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {notesList.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No notes yet.
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

const LibraryManager = memo(LibraryManagerImpl);
export default LibraryManager;
