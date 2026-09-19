import { describe, it, expect } from "vitest";
import {
  APP_DOWNLOAD_ENDPOINT,
  LATEST_APK_FALLBACK,
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

  it("uses the CI-published release asset for the announced version", () => {
    const asset =
      "https://github.com/Creatoranuj/jsrcoaching/releases/download/v1.8.4/JSRCoaching.apk";
    expect(resolveUpdateDownloadUrl(asset)).toBe(asset);
    expect(isGitHubReleaseAsset(asset)).toBe(true);
  });

  it("keeps an admin store link as-is", () => {
    const store = "https://play.google.com/store/apps/details?id=com.jsrcoaching.app";
    expect(resolveUpdateDownloadUrl(store)).toBe(store);
    expect(isGitHubReleaseAsset(store)).toBe(false);
  });

  it("falls back to the newest release for junk or missing config", () => {
    expect(resolveUpdateDownloadUrl(null)).toBe(LATEST_APK_FALLBACK);
    expect(resolveUpdateDownloadUrl("javascript:alert(1)")).toBe(LATEST_APK_FALLBACK);
    expect(resolveUpdateDownloadUrl("https://evil.example.com/x.apk")).toBe(LATEST_APK_FALLBACK);
  });

  it("still exposes a stable public download endpoint", () => {
    expect(APP_DOWNLOAD_ENDPOINT).toMatch(/\/functions\/v1\/app-download$/);
  });
});
