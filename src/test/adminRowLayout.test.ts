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

/**
 * Guard for the Upload Center rows: edit/delete used to be `opacity-0
 * group-hover:opacity-100`, which on a touch device (no hover) meant the admin
 * could never see them. They must be visible unless the device has real hover.
 */
const uploadSrc = readFileSync(
  resolve(process.cwd(), "src/pages/AdminUpload.tsx"),
  "utf8",
);

describe("upload centre row actions are reachable on touch devices", () => {
  it("never hides an action behind a hover-only opacity", () => {
    expect(uploadSrc).not.toMatch(/(?<!\[@media\(hover:hover\)\]:)opacity-0 group-hover:opacity-100/);
  });

  it("fades actions only where hover exists", () => {
    const hoverGated = uploadSrc.match(/\[@media\(hover:hover\)\]:opacity-0/g);
    expect(hoverGated?.length).toBe(4);
  });

  it("stacks chapter and sub-folder rows on mobile with truncated titles", () => {
    expect(uploadSrc.match(/flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2/g)?.length).toBe(2);
    expect(uploadSrc).toContain('<p className="font-medium text-sm truncate">{ch.title}</p>');
  });

  it("labels the chapter and sub-folder actions", () => {
    for (const label of ["Edit chapter ", "Delete chapter ", "Edit sub-folder ", "Delete sub-folder "]) {
      expect(uploadSrc).toContain(label);
    }
  });
});
