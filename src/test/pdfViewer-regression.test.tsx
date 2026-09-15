/**
 * Regression checks for the document reader stack.
 *
 * Two flaky areas worth pinning down:
 *
 *   1. PdfViewer height — a hardcoded "100dvh - Npx" calculation used to drift
 *      whenever the tab slot resized, producing the white strip at the bottom
 *      reported by users. Locking the formula in a test catches future regressions.
 *
 *   2. AutoScrollFab visibility — Google Drive PDFs are now proxied into the
 *      in-app reader, so they MUST render the FAB. Google Docs stays hidden.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  isGoogleDrive,
  isGoogleDocs,
  resolveEmbedUrl,
} from "../lib/pdfViewerUrl";
import React from "react";

// ── Mock heavy children so we can assert on the wrapper + FAB only ────────
vi.mock("../components/video/PdfViewer", () => {
  const PdfViewer = React.forwardRef(function PdfViewer(_props: any, ref: any) {
    React.useImperativeHandle(ref, () => ({
      getScrollEl: () => null,
      getIframeEl: () => null,
    }));
    return React.createElement(
      "div",
      {
        "data-testid": "pdf-wrapper",
        style: { height: "calc(100dvh - 176px + env(safe-area-inset-bottom))" },
      },
      "viewer"
    );
  });
  return { __esModule: true, default: PdfViewer };
});

vi.mock("../components/viewer/AutoScrollFab", () => ({
  __esModule: true,
  default: (props) =>
    React.createElement("div", {
      "data-testid": "autoscroll-fab",
      "data-visible": String(props.visible),
      "data-bottom-offset": String(props.bottomOffset),
    }),
}));

vi.mock("../hooks/useReaderChrome", () => ({
  useReaderChrome: () => ({
    visible: true,
    show: () => {},
    toggle: () => {},
    setPinned: () => {},
  }),
}));

import PdfViewerWithAutoScroll from "../components/video/PdfViewerWithAutoScroll";

// ── 1. Helper URL classification ──────────────────────────────────────────
describe("pdfViewerUrl helpers", () => {
  it("flags Google Drive URLs", () => {
    expect(isGoogleDrive("https://drive.google.com/file/d/abc/view")).toBe(true);
    expect(isGoogleDrive("https://example.com/file.pdf")).toBe(false);
  });

  it("flags Google Docs URLs", () => {
    expect(isGoogleDocs("https://docs.google.com/document/d/abc/edit")).toBe(true);
    expect(isGoogleDocs("https://drive.google.com/file/d/abc/view")).toBe(false);
  });

  it("routes external PDFs through the /pdfjs viewer (autoscroll-capable)", () => {
    const { embedUrl, isDrive } = resolveEmbedUrl(
      "https://cdn.example.com/file.pdf"
    );
    expect(embedUrl.startsWith("/pdfjs/web/viewer.html")).toBe(true);
    expect(isDrive).toBe(false);
  });

  it("routes Drive URLs through proxied PDF.js reader to avoid mobile blank iframes", () => {
    const { embedUrl, isDrive } = resolveEmbedUrl(
      "https://drive.google.com/file/d/abc123/view"
    );
    expect(embedUrl).toContain("/pdfjs/web/viewer.html");
    expect(embedUrl).toContain("pdf-proxy");
    expect(isDrive).toBe(true);
  });
});

// ── 2. Height calculation ─────────────────────────────────────────────────
describe("PdfViewer height calculation", () => {
  it("uses the locked 176px reservation so no white strip appears at the bottom", () => {
    render(
      <PdfViewerWithAutoScroll url="https://cdn.example.com/file.pdf" chromeVisible />
    );
    const wrapper = screen.getByTestId("pdf-wrapper");
    expect(wrapper.style.height).toMatch(/100dvh\s*-\s*176px/);
    expect(wrapper.style.height).toContain("env(safe-area-inset-bottom)");
  });
});

// ── 3. AutoScroll FAB visibility per URL type ─────────────────────────────
describe("AutoScrollFab visibility", () => {
  it("renders the FAB for local / in-app PDFs", () => {
    render(
      <PdfViewerWithAutoScroll url="https://cdn.example.com/file.pdf" />
    );
    expect(screen.queryByTestId("autoscroll-fab")).not.toBeNull();
  });

  it("keeps Lesson PDF FAB forced visible with the raised mobile offset", () => {
    render(
      <PdfViewerWithAutoScroll
        url="https://cdn.example.com/file.pdf"
        alwaysShowFab
        fabBottomOffset={96}
      />
    );
    const fab = screen.getByTestId("autoscroll-fab");
    expect(fab).toHaveAttribute("data-visible", "true");
    expect(fab).toHaveAttribute("data-bottom-offset", "96");
  });

  it("renders the FAB for Google Drive PDFs in Reader Mode", () => {
    render(
      <PdfViewerWithAutoScroll url="https://drive.google.com/file/d/abc/view" />
    );
    expect(screen.queryByTestId("autoscroll-fab")).not.toBeNull();
  });

  it("HIDES the FAB for Google Docs embeds (cross-origin, can't scroll)", () => {
    render(
      <PdfViewerWithAutoScroll url="https://docs.google.com/document/d/abc/edit" />
    );
    expect(screen.queryByTestId("autoscroll-fab")).toBeNull();
  });
});
