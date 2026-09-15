import { RefreshCw } from "lucide-react";
import { useResolvedContentUrl } from "../../hooks/useResolvedContentUrl";

function ErrorFallback({ onRetry, small }: { onRetry: () => void; small?: boolean }) {
  return (
    <div
      className={
        "rounded-lg border border-destructive/30 bg-destructive/5 text-destructive flex flex-col items-center justify-center gap-2 mb-4 p-3 text-center " +
        (small ? "h-12 w-16 text-[10px]" : "h-40 w-full text-sm")
      }
    >
      <p>Couldn't load image</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 underline underline-offset-2"
      >
        <RefreshCw className={small ? "w-3 h-3" : "w-3.5 h-3.5"} />
        Retry
      </button>
    </div>
  );
}

export function QuizQuestionImage({ src }: { src: string }) {
  const { url, status, refetch } = useResolvedContentUrl(src);
  if (status === "error") return <ErrorFallback onRetry={refetch} />;
  if (!url) return <div className="rounded-lg max-h-64 w-full mb-4 border bg-muted animate-pulse h-40" />;
  return (
    <img
      src={url}
      alt="Question"
      className="rounded-lg max-h-64 w-full object-contain mb-4 border"
      onError={() => refetch()}
    />
  );
}

export function QuizQuestionThumb({ src }: { src: string }) {
  const { url, status, refetch } = useResolvedContentUrl(src);
  if (status === "error") return <ErrorFallback onRetry={refetch} small />;
  if (!url) return <div className="rounded max-h-20 h-12 w-16 mb-1 border bg-muted animate-pulse" />;
  return <img src={url} alt="Question" className="rounded max-h-20 object-contain mb-1 border" onError={() => refetch()} />;
}
