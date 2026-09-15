/**
 * Automated coverage for PDF_ANDROID_TEST_CHECKLIST.md.
 *
 * These are logic/unit tests run in jsdom with Capacitor mocked. They verify the
 * *code paths* behind each checklist item. Real-device rows (RAM, system viewer,
 * airplane mode) still need a physical Android run — those are marked DEVICE-ONLY.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { isLocalPdfUrl } from "@/hooks/useLocalPdfSource";
import { classifyPdfError } from "@/lib/pdfErrors";
import {
  getNote,
  saveNote,
  getReadingPage,
  setReadingPage,
  extractWikiLinks,
} from "@/services/libraryNotes";
import { addFileToFolder, getItemUri, getOrCreateFolder } from "@/services/personalLibrary";
import { addDownload, downloadFileDB, getDownloads } from "@/lib/indexedDB";
import { resolveDownloadUri } from "@/services/savedDownloads";
import { computeFitPageWidth } from "@/lib/pdfFit";


// jsdom has no indexedDB by default — provide a real in-memory implementation.
import "fake-indexeddb/auto";

describe("Suite 1: Core fixes — local PDF routed to canvas (#2,#4,#5)", () => {
  it("1.1/1.3 capacitor:// + file:// + downloaded local URLs are detected as local", () => {
    expect(isLocalPdfUrl("capacitor://localhost/_capacitor_file_/data/a.pdf")).toBe(true);
    expect(isLocalPdfUrl("file:///storage/emulated/0/a.pdf")).toBe(true);
    expect(isLocalPdfUrl("http://localhost/_capacitor_file_/x.pdf")).toBe(true);
    expect(isLocalPdfUrl("ionic://localhost/x.pdf")).toBe(true);
  });

  it("1.1 remote https URLs are NOT materialised (streamed instead)", () => {
    expect(isLocalPdfUrl("https://cdn.example.com/big.pdf")).toBe(false);
  });
});

describe("Suite 2: Large PDF error handling (#3)", () => {
  it("2.3 mid-load network drop classifies as WorkerFailed", () => {
    expect(classifyPdfError(new Error("Failed to fetch dynamically imported module: worker"))).toBe(
      "WorkerFailed"
    );
  });
});

describe("Suite 3: Obsidian notes (#1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("3.1 note autosaves and reads back from IndexedDB", async () => {
    await saveNote("item-1", "# Hello\nsome note");
    expect(await getNote("item-1")).toBe("# Hello\nsome note");
  });

  it("3.2 wikilinks are parsed (with alias + dedupe)", () => {
    const links = extractWikiLinks("see [[Another PDF]] and [[Another PDF]] and [[Doc|alias]]");
    expect(links).toEqual(["Another PDF", "Doc"]);
  });

  it("3.3 offline note persists across reopen (new DB handle)", async () => {
    await saveNote("offline-note", "written offline");
    expect(await getNote("offline-note")).toBe("written offline");
  });

  it("missing note returns empty string (no crash)", async () => {
    expect(await getNote("never-written")).toBe("");
  });
});

describe("Suite 4: Storage — position restore (#7)", () => {
  it("4.1 last-read page is saved and restored", async () => {
    await setReadingPage("pdf-42", 10);
    expect(await getReadingPage("pdf-42")).toBe(10);
  });

  it("4.1 default page is 1 when never opened", async () => {
    expect(await getReadingPage("fresh-pdf")).toBe(1);
  });
});

describe("Suite 5: Crash audit classification (#6)", () => {
  it("5.1 corrupt PDF -> InvalidPdf", () => {
    expect(classifyPdfError(new Error("Invalid PDF structure"))).toBe("InvalidPdf");
    expect(classifyPdfError(new Error("corrupt stream"))).toBe("InvalidPdf");
  });

  it("5.2 missing file -> FileNotFound", () => {
    expect(classifyPdfError(new Error("Missing PDF"))).toBe("FileNotFound");
    expect(classifyPdfError(new Error("HTTP 404 not found"))).toBe("FileNotFound");
  });

  it("5.3 out of memory -> OutOfMemory", () => {
    expect(classifyPdfError(new Error("Out of memory while rendering"))).toBe("OutOfMemory");
    const re = new RangeError("Array buffer allocation failed");
    expect(classifyPdfError(re)).toBe("OutOfMemory");
  });

  it("unknown error -> Unknown (never throws)", () => {
    expect(classifyPdfError(new Error("something weird"))).toBe("Unknown");
  });
});

describe("Suite 6: Web local PDF bytes (#8)", () => {
  const pdf = new Blob(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"], { type: "application/pdf" });

  it("6.1 personal-library uploads open through a stable IndexedDB URI", async () => {
    const folder = await getOrCreateFolder("Test uploads");
    const file = new File([pdf], "local-upload.pdf", { type: "application/pdf" });
    const item = await addFileToFolder(folder.id, file);

    expect(await getItemUri(item.id)).toBe(`nb-personal-library:${item.id}`);
  });

  it("6.2 web downloads open through a stable IndexedDB URI", async () => {
    const id = await addDownload({
      title: "Saved PDF",
      filename: "saved.pdf",
      url: "https://example.com/saved.pdf",
      downloadedAt: new Date().toISOString(),
      fileType: "PDF",
      local_path: "web-indexeddb:pending",
      size_bytes: pdf.size,
      mime: pdf.type,
    });
    await downloadFileDB.put(id, pdf);

    await expect(
      resolveDownloadUri({
        id,
        title: "Saved PDF",
        filename: "saved.pdf",
        url: "https://example.com/saved.pdf",
        downloadedAt: new Date().toISOString(),
        fileType: "PDF",
        local_path: `web-indexeddb:${id}`,
      })
    ).resolves.toBe(`nb-download:${id}`);
  });
});

describe("Suite 7: Mobile viewport PDF fit (regression for centre-zoom clipping)", () => {
  it("7.1 page width never exceeds the visual viewport (360px phone)", () => {
    const w = computeFitPageWidth(360);
    expect(w).toBeLessThanOrEqual(360);
    expect(w).toBeGreaterThanOrEqual(240);
  });

  it("7.2 leaves room for horizontal padding so canvas can't clip", () => {
    expect(computeFitPageWidth(480)).toBe(480 - 16);
    expect(computeFitPageWidth(390)).toBe(390 - 16);
  });

  it("7.3 clamps to 1100px max on wide desktop", () => {
    expect(computeFitPageWidth(1920)).toBe(1100);
  });

  it("7.4 never returns below the 240px floor (tiny popups)", () => {
    expect(computeFitPageWidth(200)).toBe(240);
    expect(computeFitPageWidth(0)).toBe(240);
  });

  it("7.5 container width caps page width even if viewport is larger", () => {
    // Split pane: viewport=1200, container=500 → must fit container.
    expect(computeFitPageWidth(1200, 500)).toBe(500 - 16);
  });
});

describe("Suite 8: Offline Downloads indexing (regression for My Library NetworkError)", () => {
  it("8.1 downloaded items are indexed in IndexedDB and listable offline", async () => {
    const id = await addDownload({
      title: "Offline-listable",
      filename: "offline.pdf",
      url: "https://example.com/offline.pdf",
      downloadedAt: new Date().toISOString(),
      fileType: "PDF",
      local_path: "web-indexeddb:pending",
    });
    const all = await getDownloads();
    expect(all.some((d) => d.id === id)).toBe(true);
  });

  it("8.2 listing downloads doesn't perform any network fetch", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      calls.push(String(input));
      return Promise.reject(new Error("network must not be used"));
    }) as typeof fetch;
    try {
      await getDownloads();
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("8.3 resolveDownloadUri throws friendly offline error when bytes are missing and navigator.onLine=false", async () => {
    const id = await addDownload({
      title: "Offline-missing",
      filename: "missing.pdf",
      url: "https://example.com/missing.pdf",
      downloadedAt: new Date().toISOString(),
      fileType: "PDF",
      local_path: "web-indexeddb:pending",
    });
    const rec = { id, title: "Offline-missing", filename: "missing.pdf", url: "https://example.com/missing.pdf", downloadedAt: new Date().toISOString(), fileType: "PDF", local_path: `web-indexeddb:${id}` };
    const originalOnline = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      await expect(resolveDownloadUri(rec as never)).rejects.toThrow(/offline/i);
    } finally {
      if (originalOnline) Object.defineProperty(navigator, "onLine", originalOnline);
    }
  });

  it("8.4 resolveDownloadUri returns remote URL when bytes missing but online", async () => {
    const id = await addDownload({
      title: "Online-missing",
      filename: "missing2.pdf",
      url: "https://example.com/missing2.pdf",
      downloadedAt: new Date().toISOString(),
      fileType: "PDF",
      local_path: "web-indexeddb:pending",
    });
    const rec = { id, title: "Online-missing", filename: "missing2.pdf", url: "https://example.com/missing2.pdf", downloadedAt: new Date().toISOString(), fileType: "PDF", local_path: `web-indexeddb:${id}` };
    const originalOnline = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    try {
      const uri = await resolveDownloadUri(rec as never);
      expect(uri).toBe("https://example.com/missing2.pdf");
    } finally {
      if (originalOnline) Object.defineProperty(navigator, "onLine", originalOnline);
    }
  });
});

describe("Suite 9: PDF autoscroll regressions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("9.1 canvas PDFs autoscroll relative to the live scrollTop so finger scroll still works", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(el, "scrollHeight", { value: 4000, configurable: true });
    el.scrollTop = 20;

    let raf: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      raf = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const targetRef = { current: el };
    const { result } = renderHook(() => useAutoScroll({ targetRef }));

    act(() => result.current.toggle());
    act(() => raf?.(0));
    // User drags the page mid-run: the engine must continue from HERE, not from
    // its own remembered offset (that was the old absolute-position bug).
    el.scrollTop = 140;
    act(() => raf?.(16.67));
    act(() => raf?.(33.34));

    expect(el.scrollTop).toBeGreaterThan(140);
    expect(el.scrollTop).toBeLessThan(160);
  });


  it("9.2 iframe/PDF.js fallback sends bridge ticks instead of direct scrollTop writes", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined);

    let raf: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      raf = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const iframeRef = { current: iframe };
    const { result } = renderHook(() => useAutoScroll({ iframeRef }));

    act(() => result.current.setSpeed(0.5));
    act(() => result.current.toggle());
    act(() => raf?.(0));
    act(() => raf?.(16.67));
    act(() => raf?.(33.34));

    expect(postMessage).toHaveBeenCalledWith({ type: "nb-autoscroll-ping" }, "*");
    expect(postMessage).toHaveBeenCalledWith({ type: "nb-autoscroll-tick", dy: 0.5 }, "*");
    iframe.remove();
  });
});
