import { describe, it, expect } from "vitest";
import {
  APP_DOWNLOAD_ENDPOINT,
  isAllowedUpdateUrl,
  isGitHubReleaseAsset,
  resolveUpdateDownloadUrl,
} from "../downloadUrl";

describe("update download URL allow-list", () => {
  it("accepts our own release assets", () => {
    expect(
      isAllowedUpdateUrl(
        "https://github.com/Creatoranuj/jsrcoaching/releases/download/v1.8.4/JSRCoaching.apk",
      ),
    ).toBe(true);
    expect(
      isAllowedUpdateUrl(
        "https://github.com/Creatoranuj/jsrcoaching/releases/latest/download/JSRCoaching.apk",
      ),
    ).toBe(true);
  });

  it("accepts store listings", () => {
    expect(
      isAllowedUpdateUrl("https://play.google.com/store/apps/details?id=com.jsrcoaching.app"),
    ).toBe(true);
    expect(isAllowedUpdateUrl("https://apps.apple.com/app/id123456")).toBe(true);
  });

  it("rejects hostile or foreign links", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "http://github.com/Creatoranuj/jsrcoaching/releases/latest/download/JSRCoaching.apk",
      "https://github.com/evil/jsrcoaching/releases/latest/download/JSRCoaching.apk",
      "https://evil.example.com/JSRCoaching.apk",
      "https://play.google.com.evil.com/store/apps/details?id=x",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(isAllowedUpdateUrl(bad)).toBe(false);
    }
  });

  it("routes release assets through the stable endpoint", () => {
    expect(
      resolveUpdateDownloadUrl(
        "https://github.com/Creatoranuj/jsrcoaching/releases/download/v1.8.4/JSRCoaching.apk",
      ),
    ).toBe(APP_DOWNLOAD_ENDPOINT);
  });

  it("keeps an admin store link as-is", () => {
    const store = "https://play.google.com/store/apps/details?id=com.jsrcoaching.app";
    expect(resolveUpdateDownloadUrl(store)).toBe(store);
    expect(isGitHubReleaseAsset(store)).toBe(false);
  });

  it("falls back to the stable endpoint for junk or missing config", () => {
    expect(resolveUpdateDownloadUrl(null)).toBe(APP_DOWNLOAD_ENDPOINT);
    expect(resolveUpdateDownloadUrl("javascript:alert(1)")).toBe(APP_DOWNLOAD_ENDPOINT);
    expect(resolveUpdateDownloadUrl("https://evil.example.com/x.apk")).toBe(APP_DOWNLOAD_ENDPOINT);
  });
});
