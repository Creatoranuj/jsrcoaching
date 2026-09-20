import { describe, it, expect } from "vitest";
import { UPDATE_PAGE_PATH, UPDATE_PAGE_URL, isUpdatePageUrl } from "@/config/updatePage";

describe("update page link", () => {
  it("points at the public web host, not the app scheme", () => {
    expect(UPDATE_PAGE_URL.startsWith("https://")).toBe(true);
    expect(UPDATE_PAGE_URL.endsWith(UPDATE_PAGE_PATH)).toBe(true);
  });

  it("accepts only our exact update page", () => {
    expect(isUpdatePageUrl(UPDATE_PAGE_URL)).toBe(true);
    expect(isUpdatePageUrl(` ${UPDATE_PAGE_URL} `)).toBe(true);
  });

  it("rejects look-alike and hostile links from a push payload", () => {
    for (const bad of [
      `${UPDATE_PAGE_URL}?next=https://evil.example`,
      `${UPDATE_PAGE_URL}/../admin`,
      "https://evil.example/update",
      "http://jsrcoaching.vercel.app/update",
      "javascript:alert(1)",
      "/update",
      undefined,
      null,
      42,
    ]) {
      expect(isUpdatePageUrl(bad)).toBe(false);
    }
  });
});
