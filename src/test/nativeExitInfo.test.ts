import { describe, expect, it } from "vitest";
import {
  classifyExit,
  describeExit,
  pickNewUnreported,
  type NativeExitRecord,
} from "@/lib/nativeExitInfo";

const rec = (over: Partial<NativeExitRecord> = {}): NativeExitRecord => ({
  reason: 3,
  reasonName: "low_memory",
  timestamp: 1000,
  ...over,
});

describe("classifyExit", () => {
  it("treats low-memory kills as abnormal", () => {
    expect(classifyExit({ reasonName: "low_memory" })).toBe("abnormal");
  });

  it("treats native crashes and ANRs as abnormal", () => {
    expect(classifyExit({ reasonName: "crash_native" })).toBe("abnormal");
    expect(classifyExit({ reasonName: "anr" })).toBe("abnormal");
  });

  it("treats a user-initiated close as normal", () => {
    expect(classifyExit({ reasonName: "user_requested" })).toBe("normal");
    expect(classifyExit({ reasonName: "exit_self" })).toBe("normal");
  });

  it("does not guess at unrecognised reasons", () => {
    expect(classifyExit({ reasonName: "" })).toBe("unknown");
    expect(classifyExit({ reasonName: "other" })).toBe("unknown");
  });
});

describe("describeExit", () => {
  it("includes the memory footprint when Android reported it", () => {
    expect(describeExit(rec({ rss: 512 * 1024 }))).toBe("native exit: low_memory (512 MB RSS)");
  });

  it("omits the footprint when it is missing", () => {
    expect(describeExit(rec())).toBe("native exit: low_memory");
  });
});

describe("pickNewUnreported", () => {
  it("returns the newest record we have not reported yet", () => {
    const picked = pickNewUnreported(
      [rec({ timestamp: 500 }), rec({ timestamp: 900, reasonName: "anr" }), rec({ timestamp: 700 })],
      400
    );
    expect(picked?.timestamp).toBe(900);
  });

  it("reports nothing when every record is already seen (no duplicate alerts)", () => {
    expect(pickNewUnreported([rec({ timestamp: 500 }), rec({ timestamp: 900 })], 900)).toBeNull();
  });

  it("ignores records with a broken timestamp", () => {
    expect(
      pickNewUnreported([{ ...rec(), timestamp: Number.NaN }], 0)
    ).toBeNull();
  });

  it("handles an empty history", () => {
    expect(pickNewUnreported([], 0)).toBeNull();
  });
});
