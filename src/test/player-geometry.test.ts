import { describe, it, expect } from "vitest";
import {
  formatTime,
  isLiveStreamUrl,
  buildYoutubeEmbedUrl,
  pointerRatio,
  percentOf,
} from "@/components/video/lib/playerGeometry";

const rect = {
  top: 100,
  bottom: 200,
  left: 50,
  right: 250,
  width: 200,
  height: 100,
};

describe("formatTime", () => {
  it("formats minutes and seconds", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(75)).toBe("1:15");
    expect(formatTime(600)).toBe("10:00");
  });

  it("formats hours with zero-padding", () => {
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(3600)).toBe("1:00:00");
  });

  it("never throws on bad input", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
    expect(formatTime(undefined as unknown as number)).toBe("0:00");
  });
});

describe("isLiveStreamUrl", () => {
  it("detects live URLs", () => {
    expect(isLiveStreamUrl("https://youtube.com/live/abc123")).toBe(true);
  });
  it("rejects normal and missing URLs", () => {
    expect(isLiveStreamUrl("https://youtu.be/abc123")).toBe(false);
    expect(isLiveStreamUrl(undefined)).toBe(false);
  });
});

describe("buildYoutubeEmbedUrl", () => {
  const origin = "https://app.example.com";

  it("uses the nocookie host and disables chrome", () => {
    const url = buildYoutubeEmbedUrl("vid1", { origin });
    expect(url.startsWith("https://www.youtube-nocookie.com/embed/vid1?")).toBe(true);
    const q = new URLSearchParams(url.split("?")[1]);
    expect(q.get("controls")).toBe("0");
    expect(q.get("enablejsapi")).toBe("1");
    expect(q.get("playsinline")).toBe("1");
    expect(q.get("origin")).toBe(origin);
    expect(q.get("live")).toBeNull();
  });

  it("adds the live flag for live streams", () => {
    const q = new URLSearchParams(
      buildYoutubeEmbedUrl("vid1", { origin, isLive: true }).split("?")[1],
    );
    expect(q.get("live")).toBe("1");
  });
});

describe("pointerRatio", () => {
  it("maps horizontally at 0deg", () => {
    expect(pointerRatio(rect, 150, 0, 0).ratio).toBeCloseTo(0.5);
    expect(pointerRatio(rect, 150, 0, 0).localX).toBeCloseTo(100);
  });

  it("maps vertically at 90deg and inverts at 270deg", () => {
    expect(pointerRatio(rect, 0, 175, 90).ratio).toBeCloseTo(0.75);
    expect(pointerRatio(rect, 0, 175, 270).ratio).toBeCloseTo(0.25);
  });

  it("inverts horizontally at 180deg", () => {
    expect(pointerRatio(rect, 100, 0, 180).ratio).toBeCloseTo(0.75);
  });

  it("normalises negative and >360 rotations", () => {
    expect(pointerRatio(rect, 150, 0, 360).ratio).toBeCloseTo(0.5);
    expect(pointerRatio(rect, 0, 175, -270).ratio).toBeCloseTo(0.75);
  });

  it("clamps outside the bar", () => {
    expect(pointerRatio(rect, -500, 0, 0).ratio).toBe(0);
    expect(pointerRatio(rect, 5000, 0, 0).ratio).toBe(1);
  });
});

describe("percentOf", () => {
  it("returns 0 when duration is unknown", () => {
    expect(percentOf(10, 0)).toBe(0);
    expect(percentOf(10, -1)).toBe(0);
  });
  it("computes a percentage", () => {
    expect(percentOf(30, 120)).toBe(25);
  });
});
