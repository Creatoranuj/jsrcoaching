import { describe, expect, it } from "vitest";
import {
  canSaveOffline,
  classifyLink,
  isProxyRelayable,
  kindForLink,
} from "@/lib/linkSources";

describe("classifyLink — Google document family", () => {
  const docs = "https://docs.google.com/document/d/abc123/edit";
  const sheets = "https://docs.google.com/spreadsheets/d/abc123/edit#gid=0";
  const slides = "https://docs.google.com/presentation/d/abc123/edit";

  it.each([docs, sheets, slides])("classifies %s as a document", (url) => {
    expect(classifyLink(url)).toBe("docs");
    expect(kindForLink(url, "docs")).toBe("PDF");
    expect(canSaveOffline(url, "docs")).toBe(true);
  });

  it("still classifies Drive, Notion and archive correctly", () => {
    expect(classifyLink("https://drive.google.com/file/d/abc/view")).toBe("drive");
    expect(classifyLink("https://www.notion.so/Page-abc123")).toBe("notion");
    expect(classifyLink("https://archive.org/details/some-item")).toBe("archive");
  });

  it("classifies a plain PDF host as cdn", () => {
    expect(classifyLink("https://ncert.nic.in/textbook/pdf/keph101.pdf")).toBe("cdn");
  });
});

describe("isProxyRelayable", () => {
  it("accepts hosts the proxy actually serves", () => {
    expect(isProxyRelayable("https://ncert.nic.in/textbook/pdf/keph101.pdf")).toBe(true);
    expect(isProxyRelayable("https://storage.googleapis.com/bucket/a.pdf")).toBe(true);
    expect(isProxyRelayable("https://cdn.statically.io/gh/a/b/c.pdf")).toBe(true);
  });

  it("rejects unknown hosts", () => {
    expect(isProxyRelayable("https://evil.example.com/a.pdf")).toBe(false);
  });
});
