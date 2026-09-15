/**
 * Archive.org BookReader Component
 * Embeds Archive.org's BookReader (page-flip view) with download links
 */

import { useState, useEffect } from 'react';
import { reportError } from "@/lib/sentry";
import { 
  BookOpen, Download, ExternalLink, AlertCircle, 
  FileText, Maximize2, Minimize2 
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { beginSyntheticPop, isSyntheticPop } from "../../lib/reader/overlayHistory";


interface DownloadFormat {
  format: string;
  size?: string;
  url: string;
}

interface ArchiveBookReaderProps {
  /** Archive.org item identifier (e.g., "theworksofplato01444gut") */
  identifier: string;
  /** Optional title override */
  title?: string;
  /** Optional description */
  description?: string;
  /** Custom class name */
  className?: string;
  /** Initial height of the reader */
  height?: number;
  /** Show download links */
  showDownloads?: boolean;
  /** Callback when book fails to load */
  onError?: (error: string) => void;
}

// Common download formats available on Archive.org
const DOWNLOAD_FORMATS: { key: string; label: string; icon: string }[] = [
  { key: 'pdf', label: 'PDF', icon: '📄' },
  { key: 'epub', label: 'EPUB', icon: '📱' },
  { key: 'mobi', label: 'MOBI', icon: '📖' },
  { key: 'txt', label: 'TXT', icon: '📝' },
  { key: 'djvu', label: 'DJVU', icon: '🖼️' },
];

export function ArchiveBookReader({
  identifier,
  title,
  description,
  className,
  height = 500,
  showDownloads = true,
  onError,
}: ArchiveBookReaderProps) {
  // Screen protection removed here; only LessonView applies FLAG_SECURE for students.
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [metadata, setMetadata] = useState<{
    title?: string;
    creator?: string;
    description?: string;
    downloads?: DownloadFormat[];
  } | null>(null);

  // Embed URL for Archive.org BookReader
  // Add ui=embed to hide Archive.org's sidebar/navigation chrome
  const embedUrl = `https://archive.org/embed/${identifier}?ui=embed&remove_related_count=1`;
  const detailsUrl = `https://archive.org/details/${identifier}`;

  // Fetch metadata from Archive.org API
  useEffect(() => {
    if (!identifier) return;
    const controller = new AbortController();

    const fetchMetadata = async () => {
      try {
        setIsLoading(true);
        setHasError(false);

        // Archive.org metadata API
        const response = await fetch(
          `https://archive.org/metadata/${identifier}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch book metadata');
        }

        const data = await response.json();
        if (controller.signal.aborted) return;

        if (!data.metadata) {
          throw new Error('Book not found');
        }

        // Extract available download formats
        const downloads: DownloadFormat[] = [];
        const files = data.files || [];

        for (const file of files) {
          const format = file.format?.toLowerCase();
          const matchedFormat = DOWNLOAD_FORMATS.find(f =>
            format?.includes(f.key)
          );

          if (matchedFormat && !downloads.find(d => d.format === matchedFormat.key)) {
            downloads.push({
              format: matchedFormat.key,
              size: file.size ? formatFileSize(Number(file.size)) : undefined,
              url: `https://archive.org/download/${identifier}/${file.name}`,
            });
          }
        }

        if (controller.signal.aborted) return;
        setMetadata({
          title: data.metadata.title || identifier,
          creator: data.metadata.creator,
          description: data.metadata.description,
          downloads,
        });
      } catch (error) {
        if (controller.signal.aborted || (error as Error)?.name === 'AbortError') return;
        reportError(error, { surface: "ArchiveBookReader.metadata" });
        setHasError(true);
        onError?.(error instanceof Error ? error.message : 'Failed to load book');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    fetchMetadata();
    return () => controller.abort();
  }, [identifier, onError]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setHasError(true);
    setIsLoading(false);
    onError?.('Failed to load book viewer');
  };

  const toggleFullscreen = () => {
    setIsFullscreen((v) => !v);
  };

  // Android hardware-back sentinel: while in fullscreen, back exits
  // fullscreen instead of navigating the enclosing route.
  useEffect(() => {
    if (!isFullscreen) return;
    try { window.history.pushState({ overlay: true }, ""); } catch {}
    const onPop = () => {
      if (isSyntheticPop()) return;
      setIsFullscreen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.overlay) {
        try { beginSyntheticPop(); window.history.back(); } catch {}
      }
    };
  }, [isFullscreen]);

  // Error state
  if (hasError) {
    return (
      <Card className={cn("border-destructive/50", className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Unable to Load Book
          </h3>
          <p className="text-muted-foreground text-sm mb-4 max-w-md">
            The book "{identifier}" could not be loaded from Archive.org. 
            It may have been removed or the identifier is incorrect.
          </p>
          <Button variant="outline" asChild>
            <a href={detailsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Archive.org
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300",
      isFullscreen && "fixed inset-4 z-50 m-0",
      className
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">
                {title || metadata?.title || identifier}
              </CardTitle>
              {metadata?.creator && (
                <p className="text-sm text-muted-foreground truncate">
                  by {metadata.creator}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >

              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={detailsUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Archive.org
              </a>
            </Button>
          </div>
        </div>
        
        {(description || metadata?.description) && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {description || metadata?.description}
          </p>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {/* BookReader Iframe */}
        <div 
          className="relative bg-muted"
          style={{ height: isFullscreen ? 'calc(100vh - 200px)' : height }}
        >
          {isLoading && (
            <div
              role="status"
              aria-busy="true"
              aria-live="polite"
              aria-label="Loading book"
              className="absolute inset-0 z-10 flex flex-col items-center gap-3 bg-muted p-4"
            >
              <span className="sr-only">Loading book</span>
              <div className="skeleton-shimmer h-4 w-2/3 rounded" />
              <div className="skeleton-shimmer h-4 w-1/2 rounded" />
              <div className="skeleton-shimmer mt-2 h-[60%] w-full max-w-3xl rounded-lg" />
              <div className="skeleton-shimmer h-3 w-1/3 rounded" />
            </div>
          )}
          
          <iframe
            src={embedUrl}
            className="w-full h-full border-0"
            allowFullScreen
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            title={title || metadata?.title || `Archive.org Book: ${identifier}`}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>

        {/* Download Links */}
        {showDownloads && metadata?.downloads && metadata.downloads.length > 0 && (
          <div className="p-4 border-t bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Download className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Download Formats
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {metadata.downloads.map((download) => {
                const formatInfo = DOWNLOAD_FORMATS.find(f => f.key === download.format);
                return (
                  <Button
                    key={download.format}
                    variant="outline"
                    size="sm"
                    asChild
                    className="gap-2"
                  >
                    <a
                      href={download.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      <FileText className="h-3 w-3" />
                      <span className="uppercase">{download.format}</span>
                      {download.size && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1">
                          {download.size}
                        </Badge>
                      )}
                    </a>
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Downloads are provided by Archive.org. Please respect copyright and usage policies.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper to format file sizes
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default ArchiveBookReader;
