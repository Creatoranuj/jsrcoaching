import { memo, useMemo } from "react";
import { resolveEmbedUrl } from "../../lib/pdfViewerUrl";

interface SheetViewerProps {
  url: string;
  title?: string;
}

const SPREADSHEET_EXT = /\.(xlsx?|csv|ods|tsv)($|\?)/i;

/**
 * Sheet/Document viewer.
 * - Spreadsheets (.xlsx, .csv, etc.) → Google Docs Viewer (only viewer that renders them)
 * - PDFs and other docs → PDF.js CDN viewer via shared helper
 */
const SheetViewer = memo(({ url, title }: SheetViewerProps) => {
  const embedUrl = useMemo(() => {
    if (SPREADSHEET_EXT.test(url)) {
      return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
    }
    return resolveEmbedUrl(url).embedUrl;
  }, [url]);

  return (
    <div className="flex flex-col w-full h-full">
      <iframe
        src={embedUrl}
        className="w-full border-0 flex-1"
        title={title || "Document Preview"}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="eager"
        style={{ height: '100dvh', minHeight: '70vh' }}
      />
    </div>
  );
});

SheetViewer.displayName = "SheetViewer";

export default SheetViewer;
