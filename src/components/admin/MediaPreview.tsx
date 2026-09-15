import { useState, useEffect } from "react";
import { FileText, Video, Eye, X } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

interface MediaPreviewProps {
  file?: File | null;
  url?: string;
  type: "video" | "pdf";
}

/**
 * MediaPreview component for admin panel
 * Supports instant preview of uploaded videos and PDFs
 */
const MediaPreview = ({ file, url, type }: MediaPreviewProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } else if (url) {
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file, url]);

  // Extract YouTube video ID from URL
  const extractYouTubeId = (videoUrl: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = videoUrl.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  if (!previewUrl && !url) return null;

  const youtubeId = url ? extractYouTubeId(url) : null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-brand-accent text-brand-accent hover:bg-brand-accent/10"
        >
          <Eye className="h-4 w-4" />
          Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "video" ? (
              <Video className="h-5 w-5 text-brand-accent" />
            ) : (
              <FileText className="h-5 w-5 text-brand-accent" />
            )}
            Media Preview
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4 rounded-lg overflow-hidden bg-black">
          {type === "video" && youtubeId && (
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtubeId}?modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                className="w-full h-full border-0"
              />
            </div>
          )}
          
          {type === "video" && !youtubeId && previewUrl && (
            <div className="aspect-video">
              <video
                src={previewUrl}
                controls
                className="w-full h-full"
                controlsList="nodownload"
              >
                Your browser does not support video playback.
              </video>
            </div>
          )}
          
          {type === "pdf" && previewUrl && (
            <div className="h-[70vh]">
              <embed
                src={previewUrl}
                type="application/pdf"
                className="w-full h-full"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MediaPreview;
