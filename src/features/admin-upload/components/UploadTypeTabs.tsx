import { memo } from "react";
import { Video, FileText, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  UPLOAD_TYPES, uploadTypeIcon, uploadTypeLabel, type UploadTypeId,
} from "@/features/admin-upload/lib/uploadRules";

export interface UploadTypeTabsProps {
  value: UploadTypeId;
  onChange: (type: UploadTypeId) => void;
}

/** Pill tabs that pick the content type being uploaded. Presentational only. */
export const UploadTypeTabs = memo(function UploadTypeTabs({ value, onChange }: UploadTypeTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {UPLOAD_TYPES.map((type) => {
        const icon = uploadTypeIcon(type);
        return (
          <button
            key={type}
            onClick={() => onChange(type)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-medium transition-all whitespace-nowrap min-h-[44px]",
              value === type
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            {icon === "video" ? <Video className="h-4 w-4" />
              : icon === "test" ? <ClipboardCheck className="h-4 w-4" />
              : <FileText className="h-4 w-4" />}
            {uploadTypeLabel(type)}
          </button>
        );
      })}
    </div>
  );
});
