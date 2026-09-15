import { CloudOff, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  hasNotes?: boolean;
  onOpenNotes?: () => void;
  onRetry?: () => void;
}

export default function OfflineLectureNotice({ hasNotes, onOpenNotes, onRetry }: Props) {
  return (
    <div className="aspect-video w-full bg-black flex items-center justify-center text-white p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-white/10 flex items-center justify-center">
          <CloudOff className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">This lecture needs internet</h2>
        <p className="text-sm text-white/70">
          Lectures stream online to keep your storage free. While offline, you can
          still read this lesson's notes and PDFs.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          {hasNotes && (
            <Button onClick={onOpenNotes} variant="secondary">
              <FileText className="h-4 w-4 mr-2" /> Open Notes
            </Button>
          )}
          <Button onClick={onRetry} variant="default">
            <RefreshCw className="h-4 w-4 mr-2" /> Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
