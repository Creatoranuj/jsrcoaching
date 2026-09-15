import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Upload } from "lucide-react";

interface FileUploaderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
}

const ACCEPTED_TYPES = [
  // Markdown / text
  ".md", ".markdown", "text/markdown", "text/plain", ".txt",
  // PDF
  ".pdf", "application/pdf",
  // Sheets
  ".xlsx", ".xls", ".csv", "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Docs / Slides
  ".docx", ".doc", ".pptx", ".ppt",
  // Web
  ".html", ".htm", "text/html",
  // Images
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
].join(",");

export const FileUploader = ({ open, onOpenChange, onUpload, isUploading }: FileUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload a File</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`w-full border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragActive
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-border hover:border-primary/60 hover:bg-accent/30"
            }`}
            onClick={() => inputRef.current?.click()}
          >
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Upload className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Tap or drop a file to upload
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Markdown · PDF · Sheets · Docs · HTML · Images
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-2">
              md, pdf, xlsx, csv, docx, pptx, html, png, jpg, webp
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          {isUploading && (
            <p className="text-sm text-muted-foreground">Uploading...</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
