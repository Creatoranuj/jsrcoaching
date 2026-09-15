import { memo } from "react";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

interface Props {
  message?: string;
  onRetry: () => void;
  onOpenExternal?: () => void;
}

const ReaderErrorOverlay = memo(({ message, onRetry, onOpenExternal }: Props) => (
  <div
    role="alert"
    className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/95 px-6 text-center"
  >
    <AlertTriangle className="h-10 w-10 text-destructive" />
    <div>
      <h2 className="text-base font-semibold">Couldn't load the document</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {message ?? "The file took too long or the link is unavailable."}
      </p>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button onClick={onRetry} size="sm" className="min-h-[44px]">
        <RefreshCw className="mr-2 h-4 w-4" /> Retry
      </Button>
      {onOpenExternal && (
        <Button onClick={onOpenExternal} size="sm" variant="outline" className="min-h-[44px]">
          <ExternalLink className="mr-2 h-4 w-4" /> Open externally
        </Button>
      )}
    </div>
  </div>
));
ReaderErrorOverlay.displayName = "ReaderErrorOverlay";
export default ReaderErrorOverlay;
