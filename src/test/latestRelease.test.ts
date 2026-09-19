import { describe, it, expect, vi } from "vitest";
import { parseReleaseVersion, fetchLatestReleaseVersion } from "@/utils/latestRelease";

describe("parseReleaseVersion", () => {
  it("accepts tags with and without the v prefix", () => {
    expect(parseReleaseVersion("v1.8.9")).toBe("1.8.9");
    expect(parseReleaseVersion("1.8.9")).toBe("1.8.9");
    expect(parseReleaseVersion(" v2 ")).toBe("2");
  });

  it("rejects dispatch-style and junk tags", () => {
    expect(parseReleaseVersion("v1.0-20260919-1234-77")).toBeNull();
    expect(parseReleaseVersion("latest")).toBeNull();
    expect(parseReleaseVersion(undefined)).toBeNull();
  });
});

describe("fetchLatestReleaseVersion", () => {
  const ok = (body: unknown) =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => body } as unknown as Response);

  it("reads tag_name", async () => {
    await expect(fetchLatestReleaseVersion(ok({ tag_name: "v1.8.9" }))).resolves.toBe("1.8.9");
  });

  it("falls back to the release name", async () => {
    await expect(
      fetchLatestReleaseVersion(ok({ tag_name: "v1.0-20260919-1", name: "1.9.0" })),
    ).resolves.toBe("1.9.0");
  });

  it("returns null on a failed or rate-limited request", async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
    await expect(fetchLatestReleaseVersion(bad)).resolves.toBeNull();
    const boom = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(fetchLatestReleaseVersion(boom)).resolves.toBeNull();
  });
});
