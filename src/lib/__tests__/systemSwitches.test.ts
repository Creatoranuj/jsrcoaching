import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  EDGE_FUNCTION_SWITCHES,
  FEATURE_SWITCHES,
  edgeSwitchKey,
  isEdgeFunctionOn,
  isFeatureOn,
  isProtected,
  parseSwitchRows,
  parseSwitchValue,
} from "../systemSwitches";
import {
  isDegraded,
  reportServiceFailure,
  reportServiceSuccess,
  resetServiceHealth,
  subscribeServiceHealth,
} from "../serviceHealth";
import { clearAllSnapshots, readSnapshot, saveSnapshot, withSnapshot } from "../contentSnapshot";

describe("systemSwitches", () => {
  it("missing key = ON", () => {
    expect(parseSwitchValue(undefined)).toBe(true);
    expect(parseSwitchValue(null)).toBe(true);
    expect(parseSwitchValue("")).toBe(true);
    expect(isFeatureOn("community", {})).toBe(true);
    expect(isEdgeFunctionOn("chatbot", {})).toBe(true);
  });

  it("false/0/off/no = OFF, baaki ON", () => {
    ["false", "FALSE", "0", "off", "no"].forEach((v) => expect(parseSwitchValue(v)).toBe(false));
    ["true", "1", "on", "yes", "anything"].forEach((v) => expect(parseSwitchValue(v)).toBe(true));
  });

  it("switch OFF hone par feature band", () => {
    const switches = { [FEATURE_SWITCHES.community]: false };
    expect(isFeatureOn("community", switches)).toBe(false);
    expect(isFeatureOn("doubts", switches)).toBe(true);
  });

  it("protected cheezein DB me false hone par bhi ON", () => {
    expect(isProtected("login")).toBe(true);
    expect(isProtected("get-video-stream")).toBe(true);
    expect(isEdgeFunctionOn("pdf-proxy", { [edgeSwitchKey("pdf-proxy")]: false })).toBe(true);
    expect(isEdgeFunctionOn("get-lesson-url", { [edgeSwitchKey("get-lesson-url")]: false })).toBe(
      true,
    );
  });

  it("sirf sys_* rows parse hoti hain", () => {
    const out = parseSwitchRows([
      { key: "sys_feature_search", value: "false" },
      { key: "some_other_setting", value: "false" },
    ]);
    expect(out).toEqual({ sys_feature_search: false });
  });

  it("registry ka size wahi hai jo documented", () => {
    expect(Object.keys(FEATURE_SWITCHES)).toHaveLength(13);
    expect(EDGE_FUNCTION_SWITCHES).toHaveLength(26);
    EDGE_FUNCTION_SWITCHES.forEach((fn) => expect(isProtected(fn)).toBe(false));
  });
});

describe("serviceHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetServiceHealth();
  });
  afterEach(() => {
    resetServiceHealth();
    vi.useRealTimers();
  });

  it("60s me 3 failure par halka mode", () => {
    reportServiceFailure();
    reportServiceFailure();
    expect(isDegraded()).toBe(false);
    reportServiceFailure();
    expect(isDegraded()).toBe(true);
  });

  it("beech me success aane par counter reset", () => {
    reportServiceFailure();
    reportServiceFailure();
    reportServiceSuccess();
    reportServiceFailure();
    expect(isDegraded()).toBe(false);
  });

  it("2 minute baad khud normal", () => {
    reportServiceFailure();
    reportServiceFailure();
    reportServiceFailure();
    expect(isDegraded()).toBe(true);
    vi.advanceTimersByTime(120_001);
    expect(isDegraded()).toBe(false);
  });

  it("listener ko badlav milta hai", () => {
    const seen: boolean[] = [];
    const off = subscribeServiceHealth((d) => seen.push(d));
    reportServiceFailure();
    reportServiceFailure();
    reportServiceFailure();
    off();
    expect(seen).toEqual([true]);
  });
});

describe("contentSnapshot", () => {
  beforeEach(() => clearAllSnapshots());
  afterEach(() => clearAllSnapshots());

  it("save aur read", () => {
    saveSnapshot("lessons", [{ id: 1 }]);
    expect(readSnapshot<{ id: number }[]>("lessons")).toEqual([{ id: 1 }]);
  });

  it("30 din se purana snapshot bekaar", () => {
    saveSnapshot("old", { a: 1 });
    const key = "jsr_snap:old";
    const raw = JSON.parse(window.localStorage.getItem(key) as string);
    raw.at = Date.now() - 31 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(key, JSON.stringify(raw));
    expect(readSnapshot("old")).toBeNull();
  });

  it("server fail hone par snapshot se chalta hai", async () => {
    await withSnapshot("courses", async () => [{ id: "c1" }]);
    const out = await withSnapshot<{ id: string }[]>("courses", async () => {
      throw new Error("network down");
    });
    expect(out).toEqual([{ id: "c1" }]);
  });

  it("snapshot na ho to error aage jata hai", async () => {
    await expect(
      withSnapshot("nothing", async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
  });
});
