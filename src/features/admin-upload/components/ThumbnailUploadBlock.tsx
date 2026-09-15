import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Camera, FileUp, Link as LinkIcon, Loader2 } from "lucide-react";

export interface ThumbnailUploadBlockProps {
  mode: "url" | "file";
  onModeChange: (mode: "url" | "file") => void;
  thumbnailUrl: string;
  onThumbnailUrlChange: (url: string) => void;
  thumbnailFile: File | null;
  uploading: boolean;
  dragActive: boolean;
  onDrag: (e: React.DragEvent, setActive: (v: boolean) => void, active: boolean) => void;
  setDragActive: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFilePicked: (file: File) => void;
}

/**
 * Thumbnail picker — drag-and-drop upload or direct URL.
 * Presentational only; all rules/uploads stay with the caller.
 */
export function ThumbnailUploadBlock({
  mode,
  onModeChange,
  thumbnailUrl,
  onThumbnailUrlChange,
  thumbnailFile,
  uploading,
  dragActive,
  onDrag,
  setDragActive,
  onDrop,
  onFilePicked,
}: ThumbnailUploadBlockProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-sm font-semibold">
          <Camera className="h-4 w-4 text-primary" />
          Thumbnail <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </Label>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          <button type="button" className={cn("px-3 py-1.5 text-xs rounded min-h-[36px]", mode === 'file' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')} onClick={() => onModeChange("file")}>
            <FileUp className="h-3 w-3 inline mr-1" />Upload
          </button>
          <button type="button" className={cn("px-3 py-1.5 text-xs rounded min-h-[36px]", mode === 'url' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')} onClick={() => onModeChange("url")}>
            <LinkIcon className="h-3 w-3 inline mr-1" />URL
          </button>
        </div>
      </div>
      {mode === "file" ? (
        <div
          onDragEnter={e => onDrag(e, setDragActive, dragActive)}
          onDragOver={e => onDrag(e, setDragActive, dragActive)}
          onDragLeave={e => onDrag(e, setDragActive, false)}
          onDrop={onDrop}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
            dragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:border-primary/40",
            uploading && "pointer-events-none opacity-60"
          )}
          onClick={() => document.getElementById('thumbFileInput')?.click()}
        >
          <input
            id="thumbFileInput"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(f); e.target.value = ''; }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading thumbnail...</p>
            </div>
          ) : thumbnailFile && thumbnailUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img src={thumbnailUrl} alt="Thumbnail" className="w-32 h-20 object-cover rounded-lg border" />
              <p className="text-xs text-primary font-medium">{thumbnailFile.name}</p>
              <p className="text-[10px] text-muted-foreground">Drop or tap to replace</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Camera className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground font-medium">Drag &amp; drop thumbnail image</p>
              <p className="text-xs text-muted-foreground">or tap to browse • JPG, PNG, WebP (max 10MB)</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <Input placeholder="https://... thumbnail image URL" value={thumbnailUrl} onChange={e => onThumbnailUrlChange(e.target.value)} className="h-11" />
          {thumbnailUrl && (
            <img src={thumbnailUrl} alt="Thumbnail preview" className="w-24 h-16 object-cover rounded-lg border mt-1" />
          )}
        </>
      )}
    </div>
  );
}
