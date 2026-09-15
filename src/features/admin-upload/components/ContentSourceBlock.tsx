import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Camera, FileUp, Link as LinkIcon } from "lucide-react";
import MediaPreview from "@/components/admin/MediaPreview";

export interface ContentSourceBlockProps {
  /** Upload type label shown in the heading (PDF, DPP, NOTES, TEST…). */
  uploadType: string;
  mode: "file" | "url";
  onModeChange: (mode: "file" | "url") => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  url: string;
  onUrlChange: (url: string) => void;
}

/** Non-video content: pick a document/image file (or camera), or paste a link. */
export function ContentSourceBlock({
  uploadType,
  mode,
  onModeChange,
  file,
  onFileChange,
  url,
  onUrlChange,
}: ContentSourceBlockProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Upload {uploadType}</Label>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button type="button" className={cn("px-3 py-1.5 text-xs rounded min-h-[36px]", mode === 'file' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')} onClick={() => onModeChange("file")}>
            <FileUp className="h-3 w-3 inline mr-1" />File
          </button>
          <button type="button" className={cn("px-3 py-1.5 text-xs rounded min-h-[36px]", mode === 'url' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')} onClick={() => onModeChange("url")}>
            <LinkIcon className="h-3 w-3 inline mr-1" />URL
          </button>
        </div>
      </div>
      {mode === "file" ? (
        <>
          <div className="border-2 border-dashed border-primary/30 rounded-lg p-6 text-center hover:border-primary/60 transition-colors">
            <input
              id="pdfFile"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.jpg,.jpeg,.png,.gif"
              onChange={e => onFileChange(e.target.files?.[0] || null)}
              className="hidden"
            />
            <input
              id="pdfCamera"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={e => onFileChange(e.target.files?.[0] || null)}
              className="hidden"
            />
            <label htmlFor="pdfFile" className="cursor-pointer block">
              <FileUp className="h-8 w-8 mx-auto text-primary/50 mb-2" />
              {file
                ? <p className="text-primary font-medium text-sm">{file.name}</p>
                : <p className="text-muted-foreground text-sm">Tap to select file</p>}
            </label>
            <label htmlFor="pdfCamera" className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-muted rounded-full text-xs text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors">
              <Camera className="h-3.5 w-3.5" />
              Use Camera
            </label>
          </div>
          {file && <MediaPreview file={file} type="pdf" />}
        </>
      ) : (
        <div className="relative">
          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Paste direct link..." value={url} onChange={e => onUrlChange(e.target.value)} className="pl-10 h-12" />
        </div>
      )}
    </div>
  );
}
