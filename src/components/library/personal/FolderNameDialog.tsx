import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Input } from "../../ui/input";

export const FOLDER_COLOR_SWATCHES: string[] = [
  "hsl(210 60% 18%)",   // deep navy (default)
  "hsl(335 70% 35%)",   // magenta
  "hsl(165 65% 42%)",   // teal-green
  "hsl(190 70% 38%)",   // teal
  "hsl(140 55% 50%)",   // green
  "hsl(215 75% 42%)",   // blue
];

interface Props {
  open: boolean;
  title: string;
  initialName?: string;
  initialColor?: string | null;
  confirmLabel?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: (name: string, color: string | null) => void;
}

export default function FolderNameDialog({
  open,
  title,
  initialName = "",
  initialColor = null,
  confirmLabel = "Create",
  description,
  onCancel,
  onConfirm,
}: Props) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(
    initialColor ?? FOLDER_COLOR_SWATCHES[0]
  );

  // Reset internal state every time the dialog re-opens so consecutive
  // creates don't leak the previous selection.
  useEffect(() => {
    if (open) {
      setName(initialName);
      setColor(initialColor ?? FOLDER_COLOR_SWATCHES[0]);
    }
  }, [open, initialName, initialColor]);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center">{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Folder Name
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              maxLength={60}
              className="mt-1.5"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Select Color
            </label>
            <div className="mt-2 flex items-center gap-3 overflow-x-auto pb-1">
              {FOLDER_COLOR_SWATCHES.map((c) => {
                const selected = c === color;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => setColor(c)}
                    className={
                      "h-9 w-9 shrink-0 rounded-full border-2 transition-all " +
                      (selected
                        ? "border-primary ring-2 ring-primary/40 scale-110"
                        : "border-transparent hover:scale-105")
                    }
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!name.trim()}
            onClick={() => onConfirm(name.trim(), color)}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
