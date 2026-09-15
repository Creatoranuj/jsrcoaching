import { memo } from "react";
import { Download, FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { tapHaptic } from "@/lib/native/haptics";

export interface PdfItem {
  id: string;
  file_name: string;
  file_url: string;
  file_size?: number | null;
}

interface PdfSelectPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfs: PdfItem[];
  onSelect: (pdf: PdfItem) => void;
}

const formatSize = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Mini "PDF" thumbnail icon — a small page with a folded corner and a
// red "PDF" label, so students recognise the row as a downloadable PDF at
// a glance (matches the reference screenshot annotation).
const PdfThumb = () => (
  <div className="relative h-10 w-8 shrink-0 rounded-[3px] bg-white border border-border shadow-sm overflow-hidden">
    {/* folded corner */}
    <div className="absolute top-0 right-0 h-2.5 w-2.5 bg-muted border-l border-b border-border" />
    {/* faux content lines */}
    <div className="absolute inset-x-1 top-1.5 h-[2px] rounded bg-muted" />
    <div className="absolute inset-x-1 top-3 h-[2px] rounded bg-muted w-4" />
    {/* PDF badge */}
    <div className="absolute bottom-0 inset-x-0 bg-red-600 text-white text-[8px] font-bold leading-[10px] text-center py-[1px] tracking-wide">
      PDF
    </div>
  </div>
);

const PdfSelectPopup = memo(({ open, onOpenChange, pdfs, onSelect }: PdfSelectPopupProps) => {
  const handleSelect = (pdf: PdfItem) => {
    void tapHaptic("light");
    onSelect(pdf);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-0 max-h-[75vh] flex flex-col"
      >
        {/* grab handle */}
        <div className="pt-2 pb-1 flex justify-center shrink-0">
          <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <SheetHeader className="px-5 pt-1 pb-3 text-left shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Select PDF
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6 space-y-2 overflow-y-auto">
          {pdfs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No PDFs available</p>
          ) : (
            pdfs.map((pdf) => (
              <button
                key={pdf.id}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 active:scale-[0.99] transition-all text-left group"
                onClick={() => handleSelect(pdf)}
              >
                <PdfThumb />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{pdf.file_name}</p>
                  {pdf.file_size && (
                    <p className="text-xs text-muted-foreground">{formatSize(pdf.file_size)}</p>
                  )}
                </div>
                <span
                  aria-label="Download PDF"
                  className="shrink-0 p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                >
                  <Download className="h-4 w-4" />
                </span>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});

PdfSelectPopup.displayName = "PdfSelectPopup";

export default PdfSelectPopup;
