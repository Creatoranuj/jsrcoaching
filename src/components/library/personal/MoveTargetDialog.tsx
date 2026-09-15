import { useMemo, useState } from "react";
import { Folder, Home } from "lucide-react";
import type { PersonalFolder } from "../../../lib/personalLibraryDB";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Button } from "../../ui/button";

interface Props {
  open: boolean;
  title: string;
  folders: PersonalFolder[];
  /** Hide this folder + every descendant so we can't pick a child of the moved node. */
  excludeDescendantsOf?: string;
  /** Show a "Top level" target. */
  allowRoot?: boolean;
  onCancel: () => void;
  onConfirm: (newParentId: string | null) => void;
}

/** Pick a destination folder (or root) for a move operation. */
export default function MoveTargetDialog({
  open,
  title,
  folders,
  excludeDescendantsOf,
  allowRoot = true,
  onCancel,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const eligible = useMemo(() => {
    if (!excludeDescendantsOf) return folders;
    const forbidden = new Set<string>([excludeDescendantsOf]);
    // Iterate until stable: any folder whose parent is forbidden is also forbidden.
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (!forbidden.has(f.id) && f.parent_id && forbidden.has(f.parent_id)) {
          forbidden.add(f.id);
          grew = true;
        }
      }
    }
    return folders.filter((f) => !forbidden.has(f.id));
  }, [folders, excludeDescendantsOf]);

  // Render with simple indentation by walking parent chain depth.
  const depthOf = (f: PersonalFolder): number => {
    let d = 0;
    let cursor: string | null | undefined = f.parent_id;
    while (cursor) {
      d++;
      const parent = folders.find((x) => x.id === cursor);
      cursor = parent?.parent_id ?? null;
      if (d > 20) break;
    }
    return d;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          {allowRoot && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                selected === null
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-accent"
              }`}
            >
              <Home className="h-4 w-4" /> Top level (My Library)
            </button>
          )}
          {eligible.length === 0 && !allowRoot && (
            <p className="text-center text-xs text-muted-foreground py-6">
              No other folders to move into.
            </p>
          )}
          {eligible.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelected(f.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                selected === f.id
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-accent"
              }`}
              style={{ paddingLeft: `${8 + depthOf(f) * 14}px` }}
            >
              <Folder className="h-4 w-4 text-primary" />
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(selected)}>Move here</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
