import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  extractDriveFileId, extractDocsId, extractArchiveId,
  getDownloadUrl, getArchiveDownloadUrl,
} from "@/utils/fileUtils";
import {
  getPriority, setPriority, setPriorityBulk, priorityRank,
  priorityKeyForDownload, priorityKeyForPersonalItem, priorityKeyForLibraryPdf,
  snapshotPriorities, onPriorityChanged,
} from "@/lib/itemPriority";
import { normalizeFormat, groupByFormat, applyFormatFilter, ALL_CHIP } from "@/lib/formatChips";

describe("source id extraction", () => {
  it("pulls the Drive file id from both link shapes", () => {
    expect(extractDriveFileId("https://drive.google.com/file/d/ABC_123-x/view")).toBe("ABC_123-x");
    expect(extractDriveFileId("https://drive.google.com/open?id=XYZ789")).toBe("XYZ789");
    expect(extractDriveFileId("https://example.com/nothing")).toBeNull();
  });
  it("pulls Docs and Archive ids", () => {
    expect(extractDocsId("https://docs.google.com/document/d/DOC1/edit")).toBe("DOC1");
    expect(extractDocsId("https://docs.google.com/spreadsheets/d/S1")).toBeNull();
    expect(extractArchiveId("https://archive.org/details/my-item?x=1")).toBe("my-item");
    expect(extractArchiveId("https://archive.org/download/my-item/f.pdf")).toBe("my-item");
    expect(extractArchiveId("https://archive.org/about")).toBeNull();
  });
});

describe("getDownloadUrl", () => {
  it("rewrites Drive, Docs and Archive links", () => {
    expect(getDownloadUrl("https://drive.google.com/file/d/A1/view"))
      .toBe("https://drive.google.com/uc?export=download&id=A1");
    expect(getDownloadUrl("https://docs.google.com/document/d/D1/edit"))
      .toBe("https://docs.google.com/document/d/D1/export?format=pdf");
    expect(getDownloadUrl("https://archive.org/details/item9"))
      .toBe("https://archive.org/download/item9/item9.pdf");
  });
  it("leaves direct links untouched", () => {
    expect(getDownloadUrl("https://cdn.example.com/a.pdf")).toBe("https://cdn.example.com/a.pdf");
  });
});

describe("getArchiveDownloadUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the pdf file named in the metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ name: "cover.jpg", format: "JPEG" }, { name: "book one.pdf", format: "Text PDF" }] }),
    }));
    await expect(getArchiveDownloadUrl("item1"))
      .resolves.toBe("https://archive.org/download/item1/book%20one.pdf");
  });

  it("falls back to the id pattern when metadata fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(getArchiveDownloadUrl("item2"))
      .resolves.toBe("https://archive.org/download/item2/item2.pdf");
  });

  it("falls back when metadata has no pdf", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ files: [] }) }));
    await expect(getArchiveDownloadUrl("item3"))
      .resolves.toBe("https://archive.org/download/item3/item3.pdf");
  });
});

describe("item priority store", () => {
  beforeEach(() => {
    localStorage.clear();
    setPriorityBulk(["dl_1", "dl_2", "pl_a", "lib_z"], 0);
  });

  it("stores and clears a priority", () => {
    setPriority("dl_1", 2);
    expect(getPriority("dl_1")).toBe(2);
    setPriority("dl_1", 0);
    expect(getPriority("dl_1")).toBe(0);
  });

  it("sets many ids at once and snapshots them", () => {
    setPriorityBulk(["dl_1", "dl_2"], 1);
    expect(snapshotPriorities()).toMatchObject({ dl_1: 1, dl_2: 1 });
  });

  it("notifies subscribers on change", () => {
    const cb = vi.fn();
    const off = onPriorityChanged(cb);
    setPriority("pl_a", 3);
    expect(cb).toHaveBeenCalled();
    off();
    setPriority("pl_a", 1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("builds stable keys and sorts unset last", () => {
    expect(priorityKeyForDownload(5)).toBe("dl_5");
    expect(priorityKeyForDownload(undefined)).toBeNull();
    expect(priorityKeyForPersonalItem("u1")).toBe("pl_u1");
    expect(priorityKeyForLibraryPdf("p1")).toBe("lib_p1");
    expect([0, 3, 1, 2].map((p) => priorityRank(p as 0 | 1 | 2 | 3))).toEqual([4, 3, 1, 2]);
  });
});

describe("format chips", () => {
  const items = [
    { id: 1, format: "pdf" },
    { id: 2, format: "PDF" },
    { id: 3, format: null },
    { id: 4, format: "video" },
  ];
  const fmt = (i: { format: string | null }) => i.format;

  it("normalises raw format values", () => {
    expect(normalizeFormat("pdf")).toBe(normalizeFormat("PDF"));
    expect(normalizeFormat(null)).toBeTruthy();
  });

  it("groups and filters by chip", () => {
    const chips = groupByFormat(items, fmt);
    expect(chips.length).toBeGreaterThan(1);
    expect(chips[0].count).toBeGreaterThanOrEqual(chips[chips.length - 1].count);
    expect(applyFormatFilter(items, ALL_CHIP, fmt)).toHaveLength(4);
    expect(applyFormatFilter(items, normalizeFormat("pdf"), fmt)).toHaveLength(2);
    expect(applyFormatFilter(items, "", fmt)).toHaveLength(4);
  });
});
