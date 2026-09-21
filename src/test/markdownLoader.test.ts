import { describe, it, expect, vi, beforeEach } from "vitest";

const getDownload = vi.fn();
const downloadFileDBGet = vi.fn();
const personalGet = vi.fn();

vi.mock("@/lib/indexedDB", () => ({
  getDownload: (...a: unknown[]) => getDownload(...a),
  downloadFileDB: { get: (...a: unknown[]) => downloadFileDBGet(...a) },
}));

vi.mock("@/lib/personalLibraryDB", () => ({
  fileDB: { get: (...a: unknown[]) => personalGet(...a) },
}));

import {
  isVirtualMarkdownUrl,
  loadMarkdownText,
  nbDownloadId,
} from "@/lib/markdown/loadMarkdownText";

const mdBlob = (text: string) => new Blob([text], { type: "text/markdown" });

describe("markdown loader", () => {
  beforeEach(() => {
    getDownload.mockReset();
    downloadFileDBGet.mockReset();
    personalGet.mockReset();
  });

  it("recognises every in-app address scheme as virtual", () => {
    expect(isVirtualMarkdownUrl("nb-download:12")).toBe(true);
    expect(isVirtualMarkdownUrl("web-indexeddb:12")).toBe(true);
    expect(isVirtualMarkdownUrl("nb-personal-library:abc")).toBe(true);
    expect(isVirtualMarkdownUrl("https://example.com/a.md")).toBe(false);
  });

  it("parses nb-download ids", () => {
    expect(nbDownloadId("nb-download:41")).toBe("41");
    expect(nbDownloadId("https://x/a.md")).toBeNull();
  });

  // Regression: the Downloads screen resolves saved .md files to
  // nb-download:{id}. The viewer used to fall through to fetch(), which fails
  // with "Couldn't reach the file source (Failed to fetch ())".
  it("reads a saved download from local storage instead of fetching", async () => {
    getDownload.mockResolvedValue({ id: 7, local_path: "web-indexeddb:7" });
    downloadFileDBGet.mockResolvedValue({ blob: mdBlob("# Alankar\nnotes") });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(loadMarkdownText("nb-download:7")).resolves.toContain("# Alankar");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("explains a missing offline copy instead of showing a network error", async () => {
    getDownload.mockResolvedValue({ id: 7, local_path: "web-indexeddb:7" });
    downloadFileDBGet.mockResolvedValue(undefined);
    await expect(loadMarkdownText("nb-download:7")).rejects.toThrow(/Re-download/i);
  });

  it("reports a deleted download clearly", async () => {
    getDownload.mockResolvedValue(undefined);
    downloadFileDBGet.mockResolvedValue(undefined);
    await expect(loadMarkdownText("nb-download:9")).rejects.toThrow(/no longer exists/i);
  });

  it("still reads personal library and web-indexeddb files", async () => {
    personalGet.mockResolvedValue({ blob: mdBlob("personal") });
    await expect(loadMarkdownText("nb-personal-library:abc")).resolves.toBe("personal");

    downloadFileDBGet.mockResolvedValue({ blob: mdBlob("web tier") });
    await expect(loadMarkdownText("web-indexeddb:3")).resolves.toBe("web tier");
  });
});
