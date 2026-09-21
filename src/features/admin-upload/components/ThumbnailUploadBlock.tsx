import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Camera, FileUp, Link as LinkIcon, Loader2, TriangleAlert } from "lucide-react";
import { CourseThumbnail } from "@/components/common/CourseThumbnail";
import { useEffect, useState } from "react";

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
  const [selectedRatio, setSelectedRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!thumbnailUrl) {
      setSelectedRatio(null);
      return;
    }
    const image = new Image();
    image.onload = () => setSelectedRatio(image.naturalWidth / image.naturalHeight);
    image.onerror = () => setSelectedRatio(null);
    image.src = thumbnailUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [thumbnailUrl]);

  const ratioNeedsAttention = selectedRatio !== null && Math.abs(selectedRatio - 16 / 9) > 0.08;

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
              <CourseThumbnail src={thumbnailUrl} alt="Thumbnail" className="w-full max-w-xs rounded-lg border" />
              <p className="text-xs text-primary font-medium">{thumbnailFile.name}</p>
              <p className="text-[10px] text-muted-foreground">Drop or tap to replace</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Camera className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground font-medium">Drag &amp; drop thumbnail image</p>
              <p className="text-xs text-muted-foreground">or tap to browse • JPG, PNG, WebP (max 10MB)</p>
              <p className="mt-1 text-xs font-medium text-foreground">Best: 1280×720 px (16:9) • Minimum: 800×450 px</p>
              <p className="text-[11px] text-muted-foreground">WebP/JPG preferred • target 200–500 KB</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <Input placeholder="https://... thumbnail image URL" value={thumbnailUrl} onChange={e => onThumbnailUrlChange(e.target.value)} className="h-11" />
          {thumbnailUrl && (
            <CourseThumbnail src={thumbnailUrl} alt="Thumbnail preview" className="mt-2 w-full max-w-xs rounded-lg border" />
          )}
        </>
      )}
      {ratioNeedsAttention && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>This image is not 16:9. It will still upload and display fully, but 1280×720 px will look larger and cleaner.</span>
        </div>
      )}
    </div>
  );
}
