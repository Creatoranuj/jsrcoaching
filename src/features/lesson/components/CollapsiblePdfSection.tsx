import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ChevronDown, ChevronUp, ChevronRight, X } from "lucide-react";
import PdfIcon from "@/components/common/PdfIcon";
import PdfViewer from "@/components/video/LazyPdfViewer";
import type { PdfItem } from "@/components/video/PdfSelectPopup";

/** Collapsible PDF section for Overview tab. Extracted from LessonView.tsx. */
export function CollapsiblePdfSection({
  lessonPdfs,
  classPdfUrl,
  selectedPdf,
  onSelectPdf,
  onClosePdf,
}: {
  lessonPdfs: { id: string; file_name: string; file_url: string; file_size?: number | null }[];
  classPdfUrl?: string | null;
  selectedPdf: PdfItem | null;
  onSelectPdf: (pdf: PdfItem) => void;
  onClosePdf: () => void;
}) {
  const [open, setOpen] = useState(false);
  const count = lessonPdfs.length + (classPdfUrl ? 1 : 0);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Lecture Notes & PDFs</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{count}</Badge>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="divide-y divide-border">
          {classPdfUrl && (
            <button
              onClick={() => onSelectPdf({ id: 'class-pdf', file_name: 'Class PDF', file_url: classPdfUrl })}
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/10 transition-colors"
            >
              <PdfIcon className="h-9 w-9 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Class PDF</p>
                <p className="text-xs text-muted-foreground">Tap to view</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          {lessonPdfs.map((pdf) => (
            <button
              key={pdf.id}
              onClick={() => onSelectPdf({ id: pdf.id, file_name: pdf.file_name, file_url: pdf.file_url, file_size: pdf.file_size })}
              className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/10 transition-colors"
            >
              <PdfIcon className="h-9 w-9 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{pdf.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {pdf.file_size ? `${(pdf.file_size / 1024).toFixed(0)} KB` : 'Tap to view'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}

          {/* Inline PDF viewer */}
          {selectedPdf && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Close PDF preview"
                className="absolute top-2 right-2 z-30 min-h-11 min-w-11 p-0 bg-background/80 backdrop-blur-sm rounded-full"
                onClick={onClosePdf}
              >

                <X className="h-4 w-4" />
              </Button>
              <PdfViewer
                url={selectedPdf.file_url}
                title={selectedPdf.file_name}
                filename={selectedPdf.file_name}
                alwaysShowFab
                fabBottomOffset={96}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CollapsiblePdfSection;
