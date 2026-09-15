/**
 * Admin-managed chip configuration for the lesson page.
 *
 * Stored as a single JSON row in `site_settings` under `lesson_chip_config`
 * (the key allow-list already accepts `lesson_*`), so no schema migration is
 * needed. Two levels of control:
 *
 *   types   → defaults per content type (LECTURE / PDF / DPP / NOTES)
 *   lessons → optional override for one lesson id (wins over the type default)
 *
 * Pure / side-effect free so the merge rules are unit-testable.
 */
import type { LessonChipIcon } from "./lessonChips";

export const LESSON_CHIP_CONFIG_KEY = "lesson_chip_config";

export const LESSON_CHIP_TYPES = ["LECTURE", "PDF", "DPP", "NOTES"] as const;
export type LessonChipScopeType = (typeof LESSON_CHIP_TYPES)[number];

export interface CustomLessonChip {
  id: string;
  label: string;
  icon: LessonChipIcon;
  /** Opened in a new tab when the chip is tapped. */
  url: string;
  order: number;
}

export interface LessonChipScopeConfig {
  /** Built-in chip ids hidden in this scope. */
  hidden: string[];
  custom: CustomLessonChip[];
}

export interface LessonChipConfig {
  types: Record<string, LessonChipScopeConfig>;
  lessons: Record<string, LessonChipScopeConfig>;
}

export const EMPTY_SCOPE: LessonChipScopeConfig = { hidden: [], custom: [] };

export function emptyLessonChipConfig(): LessonChipConfig {
  return { types: {}, lessons: {} };
}

const ICONS: LessonChipIcon[] = [
  "comments", "attachment", "notes", "ask-doubt", "timeline",
  "my-doubts", "bookmarks", "mentors", "like", "rating",
];

function parseScope(raw: unknown): LessonChipScopeConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const hidden = Array.isArray(obj.hidden)
    ? obj.hidden.filter((h): h is string => typeof h === "string")
    : [];
  const custom = Array.isArray(obj.custom)
    ? obj.custom
        .map((c, i) => {
          const o = (c ?? {}) as Record<string, unknown>;
          if (typeof o.id !== "string" || typeof o.label !== "string") return null;
          const icon = ICONS.includes(o.icon as LessonChipIcon)
            ? (o.icon as LessonChipIcon)
            : "attachment";
          return {
            id: o.id,
            label: o.label,
            icon,
            url: typeof o.url === "string" ? o.url : "",
            order: typeof o.order === "number" ? o.order : i,
          } satisfies CustomLessonChip;
        })
        .filter((c): c is CustomLessonChip => c !== null)
        .sort((a, b) => a.order - b.order)
    : [];
  return { hidden, custom };
}

export function parseLessonChipConfig(raw: string | null | undefined): LessonChipConfig {
  if (!raw) return emptyLessonChipConfig();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyLessonChipConfig();
  }
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const out = emptyLessonChipConfig();
  const types = (obj.types ?? {}) as Record<string, unknown>;
  const lessons = (obj.lessons ?? {}) as Record<string, unknown>;
  Object.keys(types).forEach((k) => { out.types[k.toUpperCase()] = parseScope(types[k]); });
  Object.keys(lessons).forEach((k) => { out.lessons[k] = parseScope(lessons[k]); });
  return out;
}

export function serializeLessonChipConfig(config: LessonChipConfig): string {
  return JSON.stringify(config);
}

/** Normalise a lesson's lecture type onto one of the configurable scopes. */
export function chipScopeTypeFor(lectureType?: string | null): LessonChipScopeType {
  const t = (lectureType ?? "").toUpperCase();
  if (t.startsWith("DPP")) return "DPP";
  if (t === "PDF") return "PDF";
  if (t === "NOTES") return "NOTES";
  return "LECTURE";
}

/**
 * Type default first, per-lesson override on top: hidden lists union, custom
 * chips concatenated (lesson-level custom chips win on duplicate ids).
 */
export function resolveLessonChipScope(
  config: LessonChipConfig | null | undefined,
  lectureType?: string | null,
  lessonId?: string | null,
): LessonChipScopeConfig {
  if (!config) return EMPTY_SCOPE;
  const typeScope = config.types[chipScopeTypeFor(lectureType)] ?? EMPTY_SCOPE;
  const lessonScope = (lessonId && config.lessons[lessonId]) || EMPTY_SCOPE;
  const hidden = Array.from(new Set([...typeScope.hidden, ...lessonScope.hidden]));
  const byId = new Map<string, CustomLessonChip>();
  [...typeScope.custom, ...lessonScope.custom].forEach((c) => byId.set(c.id, c));
  const custom = Array.from(byId.values()).sort((a, b) => a.order - b.order);
  return { hidden, custom };
}
