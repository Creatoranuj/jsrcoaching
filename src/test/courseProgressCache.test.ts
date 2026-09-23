import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  courseDetailQueryKey,
  recomputeChapterCounts,
  syncLessonCompletion,
  toCompletedSet,
} from "@/lib/perf/courseProgressCache";
import { readBundleSync, writeBundle } from "@/lib/perf/chapterBundleCache";

const COURSE = "42";
const USER = "user-1";

const lessons = [
  { id: "L1", chapterId: "C1" },
  { id: "L2", chapterId: "C1" },
  { id: "L3", chapterId: "C2" },
];
const chapters = [
  { id: "__all__", title: "All Content", completedLessons: 1 },
  { id: "C1", title: "Algebra", completedLessons: 1 },
  { id: "C2", title: "Geometry", completedLessons: 0 },
];

function seedQuery(client: QueryClient, completed: string[]) {
  client.setQueryData(courseDetailQueryKey(COURSE, USER), {
    course: { id: 42, title: "Maths" },
    hasPurchased: true,
    lessons,
    chapters,
    allChapters: chapters.slice(1),
    completedSet: new Set(completed),
    lastWatched: completed[0] ?? null,
  });
}

async function flush() {
  // writeBundle awaits the storage adapter once before hitting localStorage.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("courseProgressCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("recomputes per-chapter and All-Content counts from the set", () => {
    const out = recomputeChapterCounts(new Set(["L1", "L3"]), lessons, chapters);
    expect(out.map((c) => c.completedLessons)).toEqual([2, 1, 1]);
  });

  it("coerces every persisted shape of the completed set", () => {
    expect([...toCompletedSet(new Set(["a"]))]).toEqual(["a"]);
    expect([...toCompletedSet(["a", "b"])]).toEqual(["a", "b"]);
    expect([...toCompletedSet({ a: true })]).toEqual(["a"]);
    expect(toCompletedSet(undefined).size).toBe(0);
  });

  it("marks a lesson done in the React-Query entry AND the reload bundle", async () => {
    const client = new QueryClient();
    seedQuery(client, ["L1"]);

    const result = syncLessonCompletion(client, COURSE, USER, "L2", true);
    expect(result.patched).toEqual(["query", "bundle"]);
    expect([...result.completedSet].sort()).toEqual(["L1", "L2"]);

    const data = client.getQueryData<{ completedSet: Set<string>; chapters: typeof chapters; lastWatched: string }>(
      courseDetailQueryKey(COURSE, USER),
    )!;
    expect(data.completedSet.has("L2")).toBe(true);
    expect(data.chapters.map((c) => c.completedLessons)).toEqual([2, 2, 0]);
    expect(data.lastWatched).toBe("L2");

    await flush();
    const bundle = readBundleSync(COURSE)!;
    expect(bundle).not.toBeNull();
    expect(bundle.completedSet.sort()).toEqual(["L1", "L2"]);
    expect((bundle.chapters as typeof chapters).map((c) => c.completedLessons)).toEqual([2, 2, 0]);
    expect(Date.now() - bundle.cachedAt).toBeLessThan(5_000);
  });

  it("marks a lesson not-done and keeps lastWatched", async () => {
    const client = new QueryClient();
    seedQuery(client, ["L1", "L2"]);

    const result = syncLessonCompletion(client, COURSE, USER, "L1", false);
    expect([...result.completedSet]).toEqual(["L2"]);
    const data = client.getQueryData<{ chapters: typeof chapters; lastWatched: string }>(
      courseDetailQueryKey(COURSE, USER),
    )!;
    expect(data.chapters.map((c) => c.completedLessons)).toEqual([1, 1, 0]);
    expect(data.lastWatched).toBe("L1");
  });

  it("falls back to the localStorage bundle when the query is not in memory (LessonView path)", async () => {
    await writeBundle(COURSE, {
      course: { id: 42 },
      hasPurchased: true,
      lessons,
      chapters,
      allChapters: chapters.slice(1),
      completedSet: ["L1"],
      lastWatched: "L1",
    });
    const client = new QueryClient();

    const result = syncLessonCompletion(client, COURSE, USER, "L3", true);
    expect(result.patched).toEqual(["bundle"]);
    expect(client.getQueryData(courseDetailQueryKey(COURSE, USER))).toBeUndefined();

    await flush();
    const bundle = readBundleSync(COURSE)!;
    expect(bundle.completedSet.sort()).toEqual(["L1", "L3"]);
    expect((bundle.chapters as typeof chapters).map((c) => c.completedLessons)).toEqual([2, 1, 1]);
  });

  it("is a no-op when nothing is cached yet", () => {
    const client = new QueryClient();
    const result = syncLessonCompletion(client, "999", USER, "L1", true);
    expect(result.patched).toEqual([]);
    expect(readBundleSync("999")).toBeNull();
  });
});
