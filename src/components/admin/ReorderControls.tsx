import { type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { tapHaptic } from "@/lib/native/haptics";

export interface HandleProps {
  ref: (node: HTMLElement | null) => void;
  listeners: Record<string, unknown> | undefined;
  attributes: Record<string, unknown>;
}

/**
 * Shared sensors: long-press (250ms) on touch so page scrolling still works
 * inside the Android WebView, small distance threshold on mouse/pen.
 */
export function useReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

interface ListProps<T extends { id: string }> {
  items: T[];
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}

export function ReorderList<T extends { id: string }>({ items, onMove, children }: ListProps<T>) {
  const sensors = useReorderSensors();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    void tapHaptic("medium");
    onMove(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={() => void tapHaptic("light")}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

interface SortableProps {
  id: string;
  className?: string;
  children: (handle: HandleProps) => ReactNode;
}

export function SortableTableRow({ id, className, children }: SortableProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <TableRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(isDragging && "relative z-50 bg-muted", className)}
    >
      {children({ ref: setActivatorNodeRef, listeners, attributes })}
    </TableRow>
  );
}

export function SortableCard({ id, className, children }: SortableProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(isDragging && "relative z-50 shadow-lg", className)}
    >
      {children({ ref: setActivatorNodeRef, listeners, attributes })}
    </div>
  );
}

/** Long-press drag handle. `touch-none` is required for dnd-kit touch sensors. */
export function DragHandle({ handle, label }: { handle: HandleProps; label: string }) {
  return (
    <button
      ref={handle.ref}
      {...handle.attributes}
      {...handle.listeners}
      type="button"
      aria-label={`Long-press and drag to reorder ${label}`}
      className="touch-none cursor-grab active:cursor-grabbing inline-flex h-11 w-8 items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

/** One-step arrow controls, always visible on mobile (44px tap targets). */
export function ReorderArrows({
  onUp,
  onDown,
  disableUp,
  disableDown,
  label,
  vertical = true,
}: {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
  label: string;
  vertical?: boolean;
}) {
  return (
    <div className={cn("flex items-center", vertical ? "flex-col -space-y-1" : "gap-0.5")}>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-8 shrink-0"
        onClick={(e) => { e.stopPropagation(); onUp(); }}
        disabled={disableUp}
        aria-label={`Move ${label} up`}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-8 shrink-0"
        onClick={(e) => { e.stopPropagation(); onDown(); }}
        disabled={disableDown}
        aria-label={`Move ${label} down`}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
