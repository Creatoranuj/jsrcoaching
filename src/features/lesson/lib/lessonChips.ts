/**
 * Pure helpers for the LessonView chip strip and progress maths.
 *
 * Kept free of React/DOM so the rules (which chips show, what the Like chip
 * is labelled, how progress rounds) can be unit-tested without rendering the
 * 2.5k-line lesson page.
 */

export type LessonChipIcon =
  | "comments"
  | "attachment"
  | "notes"
  | "ask-doubt"
  | "timeline"
  | "my-doubts"
  | "bookmarks"
  | "mentors"
  | "like"
  | "rating";

export interface LessonChip {
  id: string;
  label: string;
  icon: LessonChipIcon;
  /** Chips with an action fire a callback instead of switching the panel. */
  action?: "like" | "link";
  /** Target for admin-created link chips. */
  url?: string;
}

export interface LessonChipOptions {
  /** Lesson has saved smart notes (transcript markdown). */
  hasNotes: boolean;
  /** Admin/teacher can add notes even when none exist yet. */
  isAdminOrTeacher: boolean;
  hasLiked: boolean;
  likeCount: number;
  /**
   * Admin toggles from site_settings. A chip whose flag is explicitly false
   * is dropped. Unknown/undefined flags keep the chip visible, so callers
   * that pass nothing get today's behaviour.
   */
  flags?: Partial<Record<LessonChipFlag, boolean>>;
  /** Built-in chip ids hidden by the admin chip manager for this scope. */
  hiddenChipIds?: string[];
  /** Admin-created link chips appended after the built-ins. */
  customChips?: { id: string; label: string; icon: LessonChipIcon; url: string; order?: number }[];
}

export type LessonChipFlag =
  | "chipComments"
  | "chipAttachment"
  | "chipNotes"
  | "chipAskDoubt"
  | "chipTimeline"
  | "chipMyDoubts"
  | "chipBookmarks"
  | "chipMentors"
  | "chipLike"
  | "chipRating";

const CHIP_FLAG_BY_ID: Record<string, LessonChipFlag> = {
  comments: "chipComments",
  attachment: "chipAttachment",
  notes: "chipNotes",
  "ask-doubt": "chipAskDoubt",
  timeline: "chipTimeline",
  "my-doubts": "chipMyDoubts",
  bookmarks: "chipBookmarks",
  mentors: "chipMentors",
  like: "chipLike",
  rating: "chipRating",
};

/** Label shown on the Like chip — mirrors the previous inline expression. */
export function likeChipLabel(hasLiked: boolean, likeCount: number): string {
  if (hasLiked) return likeCount > 0 ? `Liked ${likeCount}` : "Liked";
  return likeCount > 0 ? `Like ${likeCount}` : "Like";
}

export function buildLessonChips(opts: LessonChipOptions): LessonChip[] {
  const { hasNotes, isAdminOrTeacher, hasLiked, likeCount, flags } = opts;
  const all: LessonChip[] = [
    { id: "comments", label: "Comments", icon: "comments" },
    { id: "attachment", label: "Attachment", icon: "attachment" },
    ...(hasNotes || isAdminOrTeacher
      ? [{ id: "notes", label: "Smart Notes", icon: "notes" as const }]
      : []),
    { id: "ask-doubt", label: "Ask Doubt", icon: "ask-doubt" },
    { id: "timeline", label: "Timeline", icon: "timeline" },
    { id: "my-doubts", label: "My Doubts", icon: "my-doubts" },
    { id: "bookmarks", label: "Bookmarks", icon: "bookmarks" },
    { id: "mentors", label: "Mentors", icon: "mentors" },
    {
      id: "like",
      label: likeChipLabel(hasLiked, likeCount),
      icon: "like",
      action: "like",
    },
    { id: "rating", label: "Rating", icon: "rating" },
  ];

  const hidden = new Set(opts.hiddenChipIds ?? []);
  const builtIns = all.filter((chip) => {
    if (hidden.has(chip.id)) return false;
    if (!flags) return true;
    const flag = CHIP_FLAG_BY_ID[chip.id];
    return flag ? flags[flag] !== false : true;
  });

  const custom = (opts.customChips ?? [])
    .filter((c) => !hidden.has(c.id))
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map<LessonChip>((c) => ({
      id: c.id,
      label: c.label,
      icon: c.icon,
      action: "link",
      url: c.url,
    }));

  return [...builtIns, ...custom];
}

/** Panel ids the viewer is allowed to open (link/action chips have no panel). */
export function firstPanelChipId(chips: LessonChip[]): string | undefined {
  return chips.find((c) => !c.action)?.id;
}

/** True when `id` maps to a chip that opens a panel in the current chip set. */
export function isPanelChipEnabled(chips: LessonChip[], id: string): boolean {
  return chips.some((c) => c.id === id && !c.action);
}


/** Course completion percentage, rounded, safe for an empty lesson list. */
export function lessonProgressPercent(completedCount: number, totalLessons: number): number {
  if (!totalLessons || totalLessons <= 0) return 0;
  const pct = Math.round((completedCount / totalLessons) * 100);
  return Math.max(0, Math.min(100, pct));
}

const DOCUMENT_TYPES = ["PDF", "DPP", "DPP_ATTEMPT", "NOTES"];

/** True when a lesson should open in the full-page document reader. */
export function isDocumentLessonType(lectureType?: string | null): boolean {
  return DOCUMENT_TYPES.includes((lectureType ?? "").toUpperCase());
}
