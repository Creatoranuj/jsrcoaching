import { supabase } from "../../integrations/supabase/client";

/**
 * Smart-note persistence that respects the live `smart_notes` uniqueness rules.
 *
 * Audit verification 2026-09-22 (CRITICAL, caught before merge):
 *
 * The table enforces "one note per user per lesson" and "one course-level note
 * per user per course" with two PARTIAL unique indexes:
 *
 *   smart_notes_user_lesson_uniq ON (user_id, lesson_id) WHERE lesson_id IS NOT NULL
 *   smart_notes_user_course_uniq ON (user_id, course_id) WHERE lesson_id IS NULL AND course_id IS NOT NULL
 *
 * PostgREST's `upsert(..., { onConflict })` emits `ON CONFLICT (cols) DO UPDATE`
 * **without** the index predicate, and Postgres cannot infer a partial index
 * without it. Reproduced on Postgres 17:
 *
 *   ERROR 42P10: there is no unique or exclusion constraint matching the
 *                ON CONFLICT specification
 *
 * …on EVERY insert, including the very first note. So `upsert` here is not a
 * fix for the duplicate-key Sentry issue — it breaks note creation outright.
 * This helper does what the database actually supports:
 *
 *   1. plain INSERT;
 *   2. on 23505 (duplicate key) look the existing row up by its natural key and
 *      either return it untouched (`onDuplicate: "reuse"` — "New note" when a
 *      note already exists) or overwrite its content (`onDuplicate: "update"` —
 *      offline replay of a save).
 *
 * Two round-trips only on the duplicate path; the common path stays one call.
 */

export interface SmartNoteKey {
  user_id: string;
  lesson_id: string | null;
  course_id: number | null;
}

export interface SmartNoteWrite extends SmartNoteKey {
  title: string;
  content_md: string;
  updated_at?: string;
}

export interface SmartNoteRecord extends SmartNoteKey {
  id: string;
  title: string;
  content_md: string;
  updated_at: string;
  created_at: string;
}

export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === PG_UNIQUE_VIOLATION;
}

/** True when the key is one the unique indexes actually cover. */
export function hasNaturalKey(key: SmartNoteKey): boolean {
  return Boolean(key.lesson_id) || (key.lesson_id == null && key.course_id != null);
}

// Return types are `unknown` on purpose: modelling them as `FilterBuilder`
// makes TS compare PostgREST's self-referential builder generics recursively
// ("Type instantiation is excessively deep", TS2589) at every call site.
type FilterBuilder = {
  eq: (column: string, value: string | number) => unknown;
  is: (column: string, value: null) => unknown;
};

/** Narrow a smart_notes query to exactly the row a unique index would match. */
// No `extends FilterBuilder` constraint: checking a PostgREST builder against
// it is what triggered TS2589 at every call site. The cast below is the only
// place the structural type is applied.
export function scopeToNaturalKey<Q>(q: Q, key: SmartNoteKey): Q {
  let scoped = (q as unknown as FilterBuilder).eq("user_id", key.user_id) as FilterBuilder;
  if (key.lesson_id) {
    scoped = scoped.eq("lesson_id", key.lesson_id) as FilterBuilder;
  } else {
    scoped = scoped.is("lesson_id", null) as FilterBuilder;
    if (key.course_id != null) scoped = scoped.eq("course_id", key.course_id) as FilterBuilder;
  }
  return scoped as Q;
}

export async function findSmartNoteByKey(key: SmartNoteKey): Promise<SmartNoteRecord | null> {
  const { data, error } = await scopeToNaturalKey(
    supabase.from("smart_notes").select("*"),
    key,
  )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as SmartNoteRecord | null) ?? null;
}

export type SaveSmartNoteResult = {
  row: SmartNoteRecord;
  /** "inserted" = new row; "reused" = existing returned untouched; "updated" = existing overwritten. */
  outcome: "inserted" | "reused" | "updated";
};

export async function saveSmartNote(
  payload: SmartNoteWrite,
  opts: { onDuplicate: "reuse" | "update" },
): Promise<SaveSmartNoteResult> {
  const { data, error } = await supabase.from("smart_notes").insert(payload).select().single();
  if (!error) return { row: data as SmartNoteRecord, outcome: "inserted" };
  if (!isUniqueViolation(error) || !hasNaturalKey(payload)) throw error;

  const existing = await findSmartNoteByKey(payload);
  if (!existing) throw error; // lost a race with a delete; surface the original error

  if (opts.onDuplicate === "reuse") return { row: existing, outcome: "reused" };

  const patch = {
    title: payload.title,
    content_md: payload.content_md,
    updated_at: payload.updated_at ?? new Date().toISOString(),
  };
  const { data: updated, error: updateError } = await supabase
    .from("smart_notes")
    .update(patch)
    .eq("id", existing.id)
    .eq("user_id", payload.user_id)
    .select()
    .single();
  if (updateError) throw updateError;
  return { row: updated as SmartNoteRecord, outcome: "updated" };
}
