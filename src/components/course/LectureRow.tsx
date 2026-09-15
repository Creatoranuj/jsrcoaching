import { memo, useCallback } from "react";
import { LectureCard, type LectureCardProps } from "./LectureCard";

/**
 * Memo'd adapter that binds a single lesson to id-based callbacks.
 *
 * Why this exists
 * ---------------
 * `MyCourseDetail` renders `filteredLessons.map(lesson => <LectureCard ...>)`.
 * If we pass inline arrows like `onClick={() => handleClick(lesson)}`, every
 * parent re-render (search keystroke, toggle, tab switch) creates a brand-new
 * function identity per row, which defeats `React.memo(LectureCard)` and
 * forces every row to reconcile.
 *
 * `LectureRow` takes the lesson once and stable `onXxx(id)` handlers (parent
 * wraps them in `useCallback` with `[]`). Inside the row, we curry them with
 * the lesson's own id — the inner closures are recreated on each row's own
 * render, but since the row itself is memo'd by lesson identity + the few
 * scalar props that actually change, the heavy `LectureCardImpl` only renders
 * when its inputs change.
 */
export interface LectureRowProps
  extends Omit<LectureCardProps, "onClick" | "onMarkComplete" | "onNotesClick" | "onDownloadClick"> {
  onSelect?: (id: string) => void;
  onNotes?: (id: string) => void;
  onDownload?: (id: string, e: React.MouseEvent) => void;
  onMarkComplete?: (id: string) => void;
}

const LectureRowImpl = ({
  onSelect,
  onNotes,
  onDownload,
  onMarkComplete,
  id,
  ...cardProps
}: LectureRowProps) => {
  const handleClick = useCallback(() => onSelect?.(id), [onSelect, id]);
  const handleNotes = useCallback(() => onNotes?.(id), [onNotes, id]);
  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDownload?.(id, e);
    },
    [onDownload, id],
  );
  const handleMark = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMarkComplete?.(id);
    },
    [onMarkComplete, id],
  );

  return (
    <LectureCard
      {...cardProps}
      id={id}
      onClick={handleClick}
      onNotesClick={handleNotes}
      onDownloadClick={handleDownload}
      onMarkComplete={handleMark}
    />
  );
};

export const LectureRow = memo(LectureRowImpl);
LectureRow.displayName = "LectureRow";

export default LectureRow;
