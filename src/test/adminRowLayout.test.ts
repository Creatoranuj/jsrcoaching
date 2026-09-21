import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for the admin chapter/subject rows: on a phone the title must wrap to
 * its own line and truncate, and the reorder/edit/delete buttons must never
 * shrink into it (Sept 2026 bug: arrows drew on top of "N11-PHY").
 */
const src = readFileSync(
  resolve(process.cwd(), "src/components/admin/ContentDrillDown.tsx"),
  "utf8",
);

describe("admin content rows stay readable on small screens", () => {
  it("stacks title and actions on mobile", () => {
    const stacked = src.match(
      /flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2/g,
    );
    // subject row + chapter (sub-folder) row
    expect(stacked?.length).toBe(2);
  });

  it("truncates long chapter titles instead of wrapping under the arrows", () => {
    expect(src).toContain('<p className="font-medium text-sm truncate">{ch.title}</p>');
    expect(src).toContain('<p className="font-medium text-sm truncate">{sc.title}</p>');
  });

  it("keeps every row action button at a fixed size", () => {
    const rowButtons = src.match(/h-9 w-9 shrink-0 sm:h-7 sm:w-7/g);
    expect(rowButtons?.length).toBeGreaterThanOrEqual(8);
  });

  it("labels the reorder arrows for screen readers", () => {
    for (const label of ["Move subject up", "Move subject down", "Move chapter up", "Move chapter down"]) {
      expect(src).toContain(label);
    }
  });
});
