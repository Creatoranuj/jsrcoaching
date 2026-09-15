import { useState, useEffect, Suspense } from "react";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Save, Eye, Edit3 } from "lucide-react";

// `/nohighlight` skips the Prism+refractor bundle (~215KB gzip) — student
// notes never need code syntax highlighting, so this is pure savings.
const MDEditor = lazyWithRetry(() => import("@uiw/react-md-editor/nohighlight"));

interface NoteEditorProps {
  initialTitle: string;
  initialContent: string;
  onSave: (title: string, content: string) => void;
  onCancel: () => void;
  isSaving: boolean;
}

export const NoteEditor = ({ initialTitle, initialContent, onSave, onCancel, isSaving }: NoteEditorProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const key = `nb_note_draft_${initialTitle}`;
    const timer = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify({ title, content })); } catch { /* ignore */ }
    }, 1000);
    return () => clearTimeout(timer);
  }, [title, content, initialTitle]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-2 border-b border-border space-y-2 shrink-0">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title..."
          className="font-semibold text-base h-9"
        />
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            className="text-xs gap-1"
            onClick={() => setPreview(!preview)}
          >
            {preview ? <Edit3 className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => onSave(title, content)}
            disabled={isSaving || !title.trim()}
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto" data-color-mode="light">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading editor…</div>}>
          <MDEditor
            value={content}
            onChange={(val) => setContent(val ?? "")}
            preview={preview ? "preview" : "edit"}
            height="100%"
            style={{ minHeight: "300px" }}
            hideToolbar={preview}
          />
        </Suspense>
      </div>
    </div>
  );
};
