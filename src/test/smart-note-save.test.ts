/**
 * Audit verification 2026-09-22 — regression guard for smart-note saves.
 *
 * `smart_notes` uses PARTIAL unique indexes; PostgREST `upsert({ onConflict })`
 * cannot target them (42P10 on every insert). The save helper must therefore
 * never call `.upsert(...)` and must recover from a 23505 by reusing/updating
 * the existing row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = {
  id: string;
  user_id: string;
  lesson_id: string | null;
  course_id: number | null;
  title: string;
  content_md: string;
  updated_at: string;
  created_at: string;
};

const calls: { op: string; args: unknown }[] = [];
let insertResult: { data: Row | null; error: unknown };
let selectResult: { data: Row | null; error: unknown };
let updateResult: { data: Row | null; error: unknown };

function chain(op: string, result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ["eq", "is", "order", "limit", "select"]) c[m] = self;
  c.single = async () => result;
  c.maybeSingle = async () => result;
  return c;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => { calls.push({ op: `${table}.insert`, args: payload }); return chain("insert", insertResult); },
      select: (cols: string) => { calls.push({ op: `${table}.select`, args: cols }); return chain("select", selectResult); },
      update: (patch: unknown) => { calls.push({ op: `${table}.update`, args: patch }); return chain("update", updateResult); },
      upsert: () => { throw new Error("upsert must not be used against partial unique indexes (42P10)"); },
    }),
  },
}));

const existing: Row = {
  id: "note-1", user_id: "u1", lesson_id: "l1", course_id: null,
  title: "My note 1", content_md: "old", updated_at: "2026-09-22T00:00:00Z", created_at: "2026-09-21T00:00:00Z",
};
const dup = { code: "23505", message: "duplicate key value violates unique constraint \"smart_notes_user_lesson_uniq\"", details: "", hint: null };

describe("saveSmartNote", () => {
  beforeEach(() => {
    calls.length = 0;
    insertResult = { data: { ...existing, id: "note-new", content_md: "" }, error: null };
    selectResult = { data: existing, error: null };
    updateResult = { data: { ...existing, content_md: "new" }, error: null };
  });

  it("inserts with a single round-trip when no note exists", async () => {
    const { saveSmartNote } = await import("@/lib/notes/saveSmartNote");
    const res = await saveSmartNote({ user_id: "u1", lesson_id: "l1", course_id: null, title: "t", content_md: "" }, { onDuplicate: "reuse" });
    expect(res.outcome).toBe("inserted");
    expect(calls.map((c) => c.op)).toEqual(["smart_notes.insert"]);
  });

  it("returns the existing note untouched on 23505 when asked to reuse", async () => {
    insertResult = { data: null, error: dup };
    const { saveSmartNote } = await import("@/lib/notes/saveSmartNote");
    const res = await saveSmartNote({ user_id: "u1", lesson_id: "l1", course_id: null, title: "My note 2", content_md: "seed" }, { onDuplicate: "reuse" });
    expect(res.outcome).toBe("reused");
    expect(res.row.id).toBe("note-1");
    expect(res.row.content_md).toBe("old");
    expect(calls.map((c) => c.op)).toEqual(["smart_notes.insert", "smart_notes.select"]);
  });

  it("overwrites the existing note on 23505 when asked to update (offline replay)", async () => {
    insertResult = { data: null, error: dup };
    const { saveSmartNote } = await import("@/lib/notes/saveSmartNote");
    const res = await saveSmartNote(
      { user_id: "u1", lesson_id: "l1", course_id: null, title: "My note 1", content_md: "new", updated_at: "2026-09-22T01:00:00Z" },
      { onDuplicate: "update" },
    );
    expect(res.outcome).toBe("updated");
    expect(res.row.content_md).toBe("new");
    expect(calls.map((c) => c.op)).toEqual(["smart_notes.insert", "smart_notes.select", "smart_notes.update"]);
    expect(calls[2].args).toMatchObject({ content_md: "new", updated_at: "2026-09-22T01:00:00Z" });
  });

  it("rethrows any non-duplicate error unchanged", async () => {
    const rls = { code: "42501", message: "permission denied for table smart_notes" };
    insertResult = { data: null, error: rls };
    const { saveSmartNote } = await import("@/lib/notes/saveSmartNote");
    await expect(
      saveSmartNote({ user_id: "u1", lesson_id: "l1", course_id: null, title: "t", content_md: "" }, { onDuplicate: "update" }),
    ).rejects.toBe(rls);
    expect(calls.map((c) => c.op)).toEqual(["smart_notes.insert"]);
  });

  it("scopes a course-level note to lesson_id IS NULL (the second partial index)", async () => {
    const { scopeToNaturalKey } = await import("@/lib/notes/saveSmartNote");
    const ops: string[] = [];
    const q = {
      eq: (c: string, v: unknown) => { ops.push(`eq ${c}=${String(v)}`); return q; },
      is: (c: string, v: unknown) => { ops.push(`is ${c}=${String(v)}`); return q; },
    };
    scopeToNaturalKey(q, { user_id: "u1", lesson_id: null, course_id: 35 });
    expect(ops).toEqual(["eq user_id=u1", "is lesson_id=null", "eq course_id=35"]);
  });
});

describe("no smart_notes upsert remains in app code", () => {
  it("useSmartNotesList and the offline handler go through saveSmartNote", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const list = fs.readFileSync(path.join(root, "src/hooks/useSmartNotesList.ts"), "utf8");
    const handlers = fs.readFileSync(path.join(root, "src/lib/offline/registerHandlers.ts"), "utf8");
    expect(list).not.toMatch(/\.upsert\(/);
    expect(handlers).not.toMatch(/from\("smart_notes"\)\s*\.upsert\(/);
    expect(list).toMatch(/saveSmartNote\(/);
    expect(handlers).toMatch(/saveSmartNote\(/);
  });
});
