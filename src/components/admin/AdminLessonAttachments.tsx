import { useRef, useState } from "react";
import { Paperclip, Loader2, Trash2, ArrowUp, ArrowDown, FileText, FileType2, Image as ImageIcon, Music, Video, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLessonAttachments, type LessonAttachment, type LessonAttachmentKind } from "@/hooks/useLessonAttachments";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB warn threshold

const ICONS: Record<LessonAttachmentKind, typeof FileText> = {
  pdf: FileText, doc: FileType2, image: ImageIcon, video: Video, audio: Music, other: File,
};

interface Props {
  lessonId: string;
}

export function AdminLessonAttachments({ lessonId }: Props) {
  const { attachments, loading, addAttachment, deleteAttachment, fetchAttachments } = useLessonAttachments(lessonId);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          toast.warning(`${file.name} is larger than 50 MB — upload may be slow.`);
        }
        await addAttachment(lessonId, file);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const swapPositions = async (a: LessonAttachment, b: LessonAttachment) => {
    const updates = [
      supabase.from("lesson_attachments").update({ position: b.position }).eq("id", a.id),
      supabase.from("lesson_attachments").update({ position: a.position }).eq("id", b.id),
    ];
    const results = await Promise.all(updates);
    const err = results.find(r => r.error)?.error;
    if (err) toast.error("Reorder failed: " + err.message);
    await fetchAttachments();
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    void swapPositions(attachments[idx], attachments[idx - 1]);
  };
  const moveDown = (idx: number) => {
    if (idx >= attachments.length - 1) return;
    void swapPositions(attachments[idx], attachments[idx + 1]);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1">
        <Paperclip className="h-3 w-3 text-primary" /> Attachments (Any File)
      </Label>

      {loading && attachments.length === 0 && (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}

      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((att, idx) => {
            const Icon = ICONS[att.kind] || File;
            return (
              <div key={att.id} className="flex items-center gap-2 p-1.5 bg-muted/30 rounded-md">
                <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate">{att.title || att.file_name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{att.kind}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveUp(idx)}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === attachments.length - 1} onClick={() => moveDown(idx)}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { if (confirm(`Delete "${att.title || att.file_name}"?`)) void deleteAttachment(att.id); }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={inputRef}
        id={`attachUpload-${lessonId}`}
        type="file"
        multiple
        onChange={e => void handleFiles(e.target.files)}
        className="hidden"
      />
      <label
        htmlFor={`attachUpload-${lessonId}`}
        className="cursor-pointer block border border-dashed border-muted-foreground/20 rounded p-2 text-center hover:border-primary/40 transition-colors"
      >
        {busy ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</span>
        ) : (
          <p className="text-muted-foreground text-xs">+ Add Attachments (PDF, DOC, image, video, audio…)</p>
        )}
      </label>
    </div>
  );
}
