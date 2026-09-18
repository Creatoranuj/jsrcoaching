import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ImageIcon } from "lucide-react";
import { ChapterIcon } from "./ChapterIcon";

interface ChapterIconEditorProps {
  value: string;
  mode: "file" | "url";
  onModeChange: (mode: "file" | "url") => void;
  onChange: (value: string) => void;
  onUpload: (file: File) => void;
  uploading: boolean;
}

/**
 * Icon picker used both when creating and when editing a subject/chapter.
 * "Paste Link" accepts any external image URL; "Upload Icon" stores the file
 * and keeps a `storage://content/...` reference. Clearing the field removes
 * the icon on save.
 */
export function ChapterIconEditor({
  value,
  mode,
  onModeChange,
  onChange,
  onUpload,
  uploading,
}: ChapterIconEditorProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "url" ? "default" : "outline"}
          className="text-xs h-8"
          onClick={() => onModeChange("url")}
        >
          Paste Link
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "file" ? "default" : "outline"}
          className="text-xs h-8"
          onClick={() => onModeChange("file")}
        >
          Upload Icon
        </Button>
      </div>
      {mode === "url" ? (
        <Input
          placeholder="Paste icon URL (leave empty to remove)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-[10rem] h-8 text-base"
        />
      ) : (
        <label className="cursor-pointer flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2 hover:bg-muted transition-colors">
          <ImageIcon className="h-4 w-4" />
          {uploading ? "Uploading..." : value ? "Icon set ✓" : "Choose File"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
        </label>
      )}
      {value ? <ChapterIcon url={value} fallbackLabel="?" className="h-8 w-8 shrink-0" /> : null}
    </div>
  );
}
