import { memo } from "react";
import { cn } from "@/lib/utils";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { AttachmentRow } from "@/components/lesson/AttachmentRow";
import type { LessonAttachment } from "@/hooks/useLessonAttachments";

// "Attachments" chip panel of the lesson page, lifted verbatim out of
// LessonView.tsx. Purely presentational — every fetch, signed-URL resolve and
// download side effect stays in the page and arrives as a prop.

export interface LessonPdfItem {
  id: string;
  file_name: string;
  file_url: string;
}

interface LessonAttachmentsPanelProps {
  lessonTitle: string;
  classPdfUrl: string | null | undefined;
  pdfs: LessonPdfItem[];
  attachments: LessonAttachment[];
  notesOpen: boolean;
  onToggleNotes: () => void;
  onOpenPdf: (item: LessonPdfItem) => void;
  resolveAttachmentUrl: (attachment: LessonAttachment) => Promise<string | null>;
  onAttachmentDownloaded: (title: string, url: string, filename: string, kind: string) => void;
  pdfsLoading: boolean;
  attachmentsLoading: boolean;
}

function LessonAttachmentsPanelImpl({
  lessonTitle,
  classPdfUrl,
  pdfs,
  attachments,
  notesOpen,
  onToggleNotes,
  onOpenPdf,
  resolveAttachmentUrl,
  onAttachmentDownloaded,
  pdfsLoading,
  attachmentsLoading,
}: LessonAttachmentsPanelProps) {
  const hasNotes = !!classPdfUrl || pdfs.length > 0;
  const isEmpty =
    !classPdfUrl && pdfs.length === 0 && attachments.length === 0 && !pdfsLoading && !attachmentsLoading;

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Notes (PDF list) */}
      {hasNotes && (
        <div>
          <button
            type="button"
            onClick={onToggleNotes}
            className="w-full flex items-center justify-between py-2 text-left"
            aria-expanded={notesOpen}
          >
            <h3 className="font-semibold text-base text-foreground">Notes</h3>
            {notesOpen
              ? <ChevronUp className="h-5 w-5 text-muted-foreground" />
              : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-200 ease-out",
              notesOpen ? "max-h-[2000px] opacity-100 mt-1" : "max-h-0 opacity-0",
            )}
          >
            <div className="space-y-1 pl-2">
              {classPdfUrl && (
                <button
                  onClick={() => onOpenPdf({ id: "class-pdf", file_name: `${lessonTitle} : Class Notes`, file_url: classPdfUrl })}
                  className="flex items-center gap-3 py-2.5 w-full text-left hover:bg-accent/10 active:bg-accent/20 active:scale-[0.99] rounded-md px-2 transition-all duration-150 ease-out"
                >
                  <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <p className="flex-1 min-w-0 text-[15px] text-foreground truncate">{lessonTitle} : Class Notes</p>
                </button>
              )}
              {pdfs.map((pdf) => (
                <button
                  key={pdf.id}
                  onClick={() => onOpenPdf({ id: pdf.id, file_name: pdf.file_name, file_url: pdf.file_url })}
                  className="flex items-center gap-3 py-2.5 w-full text-left hover:bg-accent/10 active:bg-accent/20 active:scale-[0.99] rounded-md px-2 transition-all duration-150 ease-out"
                >
                  <div className="h-7 w-7 rounded-md bg-destructive/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <p className="flex-1 min-w-0 text-[15px] text-foreground truncate">{pdf.file_name}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Generic file attachments (any kind — pdf, doc, image, video, audio, other) */}
      {attachments.length > 0 && (
        <div>
          <h3 className="font-semibold text-base text-foreground mt-3 mb-1">Attachments</h3>
          <div className="space-y-1 pl-2">
            {attachments.map((att) => (
              <AttachmentRow
                key={att.id}
                attachment={att}
                onOpenPdf={(url: string, fileName: string) => onOpenPdf({ id: att.id, file_name: fileName, file_url: url })}
                resolveUrl={() => resolveAttachmentUrl(att)}
                onDownloaded={onAttachmentDownloaded}
              />
            ))}
          </div>
        </div>
      )}

      {isEmpty && (
        <p className="text-center text-sm text-muted-foreground py-6">No attachments available for this lesson.</p>
      )}
    </div>
  );
}

export const LessonAttachmentsPanel = memo(LessonAttachmentsPanelImpl);
export default LessonAttachmentsPanel;
