import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { FileUp, Link as LinkIcon, Loader2, Upload, Video } from "lucide-react";
import MediaPreview from "@/components/admin/MediaPreview";

export interface VideoUploadBlockProps {
  /** LIVE hides the self-storage toggle and always uses a URL. */
  isLive: boolean;
  mode: "url" | "file";
  onModeChange: (mode: "url" | "file") => void;
  videoUrl: string;
  onVideoUrlChange: (url: string) => void;
  videoFile: File | null;
  uploading: boolean;
  progress: number;
  dragActive: boolean;
  onDrag: (e: React.DragEvent, setActive: (v: boolean) => void, active: boolean) => void;
  setDragActive: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onFilePicked: (file: File) => void;
}

/** Video source block: paste a URL, or drag/drop a file into self storage. */
export function VideoUploadBlock({
  isLive,
  mode,
  onModeChange,
  videoUrl,
  onVideoUrlChange,
  videoFile,
  uploading,
  progress,
  dragActive,
  onDrag,
  setDragActive,
  onDrop,
  onFilePicked,
}: VideoUploadBlockProps) {
  const urlMode = isLive || mode === "url";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{isLive ? "YouTube Live / Meeting URL" : "Video Source"}</Label>
        {!isLive && (
          <div className="flex gap-1 bg-muted rounded-md p-0.5">
            <button type="button" className={cn("px-3 py-1.5 text-xs rounded min-h-[36px]", mode === 'url' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')} onClick={() => onModeChange("url")}>
              <LinkIcon className="h-3 w-3 inline mr-1" />URL
            </button>
            <button type="button" className={cn("px-3 py-1.5 text-xs rounded min-h-[36px]", mode === 'file' ? 'bg-background shadow text-foreground' : 'text-muted-foreground')} onClick={() => onModeChange("file")}>
              <FileUp className="h-3 w-3 inline mr-1" />Self Storage
            </button>
          </div>
        )}
      </div>
      {urlMode ? (
        <>
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="https://..." value={videoUrl} onChange={e => onVideoUrlChange(e.target.value)} className="pl-10 h-12" />
          </div>
          {videoUrl && <MediaPreview url={videoUrl} type="video" />}
        </>
      ) : (
        <div
          onDragEnter={e => onDrag(e, setDragActive, dragActive)}
          onDragOver={e => onDrag(e, setDragActive, dragActive)}
          onDragLeave={e => onDrag(e, setDragActive, false)}
          onDrop={onDrop}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
            dragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:border-primary/40",
            uploading && "pointer-events-none opacity-60"
          )}
          onClick={() => document.getElementById('videoFileInput')?.click()}
        >
          <input
            id="videoFileInput"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv,.avi"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFilePicked(f); e.target.value = ''; }}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Uploading video...</p>
              <div className="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">{videoFile?.name}</p>
            </div>
          ) : videoFile && videoUrl ? (
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <Video className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-foreground">{videoFile.name}</p>
              <p className="text-xs text-muted-foreground">{(videoFile.size / (1024 * 1024)).toFixed(1)} MB • Uploaded ✓</p>
              <p className="text-[10px] text-muted-foreground">Drop or tap to replace</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 rounded-full bg-primary/10">
                <Upload className="h-8 w-8 text-primary/60" />
              </div>
              <p className="text-sm font-medium text-foreground">Drag &amp; drop video file</p>
              <p className="text-xs text-muted-foreground">or tap to browse • MP4, WebM, MOV, MKV (max 500MB)</p>
              <Badge variant="outline" className="text-[10px] mt-1">Self Storage → course-videos bucket</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
