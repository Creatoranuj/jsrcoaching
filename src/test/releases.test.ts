import { describe, expect, it } from "vitest";
import {
  getCurrentReleaseVersion,
  getInstalledVersionState,
  type AppRelease,
} from "../lib/releases";

const rel = (over: Partial<AppRelease>): AppRelease => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  version: over.version ?? "1.0.0",
  version_code: over.version_code ?? null,
  title: over.title ?? "",
  notes: over.notes ?? "",
  status: over.status ?? "supported",
  is_current: over.is_current ?? false,
  released_at: over.released_at ?? "2026-09-20",
});

describe("getInstalledVersionState", () => {
  const releases = [
    rel({ version: "1.4.2", is_current: true }),
    rel({ version: "1.4.1", status: "deprecated" }),
    rel({ version: "1.3.0", status: "forced_update" }),
  ];

  it("finds the exact installed version", () => {
    const state = getInstalledVersionState("1.4.1", releases);
    expect(state.known).toBe(true);
    expect(state.status).toBe("deprecated");
  });

  it("tolerates a v-prefix on either side", () => {
    expect(getInstalledVersionState("v1.4.2", releases).status).toBe("supported");
    expect(
      getInstalledVersionState("1.4.2", [rel({ version: "v1.4.2", is_current: true })]).known,
    ).toBe(true);
  });

  it("reports unknown when the version has no row", () => {
    expect(getInstalledVersionState("9.9.9", releases).known).toBe(false);
  });

  it("never blocks on empty or missing history", () => {
    expect(getInstalledVersionState("1.3.0", []).known).toBe(false);
    expect(getInstalledVersionState("1.3.0", null).known).toBe(false);
    expect(getInstalledVersionState(null, releases).known).toBe(false);
  });
});

describe("getCurrentReleaseVersion", () => {
  it("returns the current release version", () => {
    expect(
      getCurrentReleaseVersion([
        rel({ version: "1.4.2" }),
        rel({ version: "1.4.3", is_current: true }),
      ]),
    ).toBe("1.4.3");
  });

  it("returns null when nothing is current or list is missing", () => {
    expect(getCurrentReleaseVersion([rel({ version: "1.0.0" })])).toBeNull();
    expect(getCurrentReleaseVersion(null)).toBeNull();
  });
});
