import { describe, it, expect } from "vitest";
import {
  formatChatTs,
  formatRelativeTime,
  redactPdfDebugUrl,
  SARTHI_SUGGESTIONS,
} from "@/features/lesson/lib/format";

describe("redactPdfDebugUrl", () => {
  it("drops the query string of a signed URL", () => {
    expect(
      redactPdfDebugUrl("https://cdn.example.com/a/b.pdf?token=secret&exp=1", "https://app.test")
    ).toBe("https://cdn.example.com/a/b.pdf?…");
  });

  it("keeps a clean URL intact", () => {
    expect(redactPdfDebugUrl("https://cdn.example.com/a/b.pdf", "https://app.test")).toBe(
      "https://cdn.example.com/a/b.pdf"
    );
  });

  it("never leaks the query string, even for odd input", () => {
    const out = redactPdfDebugUrl("not a url?token=secret", "https://app.test");
    expect(out).not.toContain("secret");
    expect(out.endsWith("?…") || out === "not a url").toBe(true);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  it("returns empty for null", () => expect(formatRelativeTime(null, now)).toBe(""));
  it("under a minute", () =>
    expect(formatRelativeTime("2026-01-10T11:59:30Z", now)).toBe("Just now"));
  it("minutes", () => expect(formatRelativeTime("2026-01-10T11:45:00Z", now)).toBe("15m ago"));
  it("hours", () => expect(formatRelativeTime("2026-01-10T09:00:00Z", now)).toBe("3h ago"));
  it("days", () => expect(formatRelativeTime("2026-01-08T12:00:00Z", now)).toBe("2d ago"));
  it("older than a week falls back to a date", () =>
    expect(formatRelativeTime("2025-11-01T12:00:00Z", now)).toBe(
      new Date("2025-11-01T12:00:00Z").toLocaleDateString()
    ));
});

describe("formatChatTs", () => {
  it("formats a valid timestamp", () => {
    expect(formatChatTs(Date.UTC(2026, 0, 1, 8, 30))).toMatch(/\d/);
  });
  it("returns a string for a bogus timestamp", () => {
    expect(typeof formatChatTs(Number.NaN)).toBe("string");
  });
});

describe("SARTHI_SUGGESTIONS", () => {
  it("has four non-empty prompts", () => {
    expect(SARTHI_SUGGESTIONS).toHaveLength(4);
    expect(SARTHI_SUGGESTIONS.every((s) => s.trim().length > 0)).toBe(true);
  });
});
