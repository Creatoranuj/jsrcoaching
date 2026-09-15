/**
 * ChapterGroupedSidebar — Collapsible chapter-grouped sidebar for course content.
 * Extracted from LessonView.tsx (was a nested inner function; MAINT debt).
 */
import React, { useState } from "react";
import { Badge } from "../ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ChapterGroupedSidebarProps {
  chapterMap: Map<
    string,
    { chapter: { id: string; code: string; title: string } | null; lessons: any[] }
  >;
  uncategorized: any[];
  lessons: any[];
  renderLesson: (lesson, globalIndex: number) => React.ReactNode;
  currentLessonChapterId?: string | null;
}

export function ChapterGroupedSidebar({
  chapterMap,
  uncategorized,
  lessons,
  renderLesson,
  currentLessonChapterId,
}: ChapterGroupedSidebarProps) {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (currentLessonChapterId) initial.add(currentLessonChapterId);
    return initial;
  });

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const globalIndexMap = new Map<string, number>();
  lessons.forEach((l, i: number) => globalIndexMap.set(l.id, i));

  return (
    <div className="divide-y divide-border">
      {uncategorized.length > 0 && (
        <div>
          {uncategorized.map((lesson) =>
            renderLesson(lesson, globalIndexMap.get(lesson.id) ?? 0)
          )}
        </div>
      )}

      {Array.from(chapterMap.entries()).map(([chapterId, { chapter, lessons: chLessons }]) => {
        const isExpanded = expandedChapters.has(chapterId);

        return (
          <div key={chapterId}>
            <button
              onClick={() => toggleChapter(chapterId)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-primary shrink-0">
                  {chapter?.code || "CH"}
                </span>
                <span className="text-sm font-semibold text-foreground truncate">
                  {chapter?.title || "Uncategorized"}
                </span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                  {chLessons.length}
                </Badge>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
            {isExpanded && (
              <div>
                {chLessons.map((lesson) =>
                  renderLesson(lesson, globalIndexMap.get(lesson.id) ?? 0)
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ChapterGroupedSidebar;
