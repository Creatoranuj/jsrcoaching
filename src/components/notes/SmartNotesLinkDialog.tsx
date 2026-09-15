import { useState } from "react";
import { Link as LinkIcon, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export interface SmartNotesLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Import a single URL; called once per URL when user submits. */
  onImport: (url: string) => Promise<void>;
  /** Optional running progress 0-100 from the parent import pipeline. */
  progress?: number | null;
}

/**
 * Polished replacement for the old `window.prompt()` URL importer.
 * - Multiple URLs (one per row, add/remove rows freely).
 * - http(s) validation per row before submit.
 * - Imports sequentially so the parent's progress UI stays accurate.
 */
export default function SmartNotesLinkDialog({
  open,
  onOpenChange,
  onImport,
  progress,
}: SmartNotesLinkDialogProps) {
  const [urls, setUrls] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const reset = () => {
    setUrls([""]);
    setErrors({});
    setBusy(false);
  };

  const update = (i: number, v: string) => {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? v : u)));
    setErrors((prev) => {
      if (!prev[i]) return prev;
      const next = { ...prev };
      delete next[i];
      return next;
    });
  };

  const addRow = () => setUrls((prev) => [...prev, ""]);
  const removeRow = (i: number) =>
    setUrls((prev) => (prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i)));

  const validate = (): { valid: string[]; nextErrors: Record<number, string> } => {
    const valid: string[] = [];
    const nextErrors: Record<number, string> = {};
    urls.forEach((raw, i) => {
      const v = raw.trim();
      if (!v) return; // empty rows ignored
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol)) {
          nextErrors[i] = "Only http(s) URLs are supported";
          return;
        }
        valid.push(u.toString());
      } catch {
        nextErrors[i] = "Invalid URL";
      }
    });
    return { valid, nextErrors };
  };

  const handleSubmit = async () => {
    const { valid, nextErrors } = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (valid.length === 0) {
      setErrors({ 0: "Add at least one URL" });
      return;
    }
    setBusy(true);
    try {
      // Sequential — parent's progress bar reflects per-file work.
      for (const u of valid) {
        await onImport(u);
      }
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-primary" />
            Import from links
          </DialogTitle>
          <DialogDescription>
            Paste one or more URLs (Markdown / TXT / PDF / image). Har link ek baar
            me import hoga.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {urls.map((u, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <Input
                  autoFocus={i === 0}
                  value={u}
                  onChange={(e) => update(i, e.target.value)}
                  placeholder="https://example.com/notes.md"
                  disabled={busy}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(i)}
                  disabled={busy || (urls.length === 1 && !u)}
                  aria-label="Remove URL"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {errors[i] && (
                <p className="text-[11px] text-destructive pl-1">{errors[i]}</p>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addRow}
            disabled={busy}
            className="h-8 text-xs text-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add another URL
          </Button>
        </div>

        {busy && progress != null && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Importing… {Math.round(progress)}%
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <LinkIcon className="h-4 w-4 mr-2" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
