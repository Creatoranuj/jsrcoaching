import { describe, it, expect } from "vitest";
import {
  parsePlayerReaderRows,
  PLAYER_READER_KEYS,
  PLAYER_READER_DEFAULTS,
} from "@/hooks/usePlayerReaderControls";

describe("usePlayerReaderControls", () => {
  it("uses defaults when rows are empty", () => {
    expect(parsePlayerReaderRows([])).toEqual(PLAYER_READER_DEFAULTS);
  });

  it("parses true/1/on/yes as enabled", () => {
    const rows = [
      { key: PLAYER_READER_KEYS.infinityLogo, value: "1" },
      { key: PLAYER_READER_KEYS.youtubeMask, value: "yes" },
      { key: PLAYER_READER_KEYS.readerZoom, value: "on" },
    ];
    expect(parsePlayerReaderRows(rows)).toEqual({
      infinityLogo: true,
      youtubeMask: true,
      readerZoom: true,
    });
  });

  it("parses everything else as disabled", () => {
    const rows = [
      { key: PLAYER_READER_KEYS.infinityLogo, value: "false" },
      { key: PLAYER_READER_KEYS.youtubeMask, value: "0" },
      { key: PLAYER_READER_KEYS.readerZoom, value: "OFF" },
    ];
    expect(parsePlayerReaderRows(rows)).toEqual({
      infinityLogo: false,
      youtubeMask: false,
      readerZoom: false,
    });
  });

  it("keeps unrelated keys out of the result", () => {
    const rows = [
      { key: PLAYER_READER_KEYS.readerZoom, value: "true" },
      { key: "youtube_url", value: "https://example.com" },
    ];
    const result = parsePlayerReaderRows(rows);
    expect(result.readerZoom).toBe(true);
    expect("youtube_url" in result).toBe(false);
  });
});
