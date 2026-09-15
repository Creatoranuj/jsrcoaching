import { describe, it, expect } from "vitest";
import {
  MENU_FEATURE_KEYS,
  MENU_FEATURE_DEFAULTS,
  parseMenuFeatureRows,
} from "@/hooks/useMenuFeatureFlags";

describe("menu feature flags", () => {
  it("defaults every section to ON when no rows exist", () => {
    expect(parseMenuFeatureRows([])).toEqual(MENU_FEATURE_DEFAULTS);
  });

  it("covers the four admin-controlled sections", () => {
    expect(Object.keys(MENU_FEATURE_KEYS).sort()).toEqual([
      "community",
      "doubts",
      "messages",
      "reports",
    ]);
  });

  it("turns a section OFF only for an explicit false value", () => {
    const flags = parseMenuFeatureRows([
      { key: "menu_reports", value: "false" },
      { key: "menu_messages", value: "true" },
      { key: "menu_community", value: null },
    ]);
    expect(flags.reports).toBe(false);
    expect(flags.messages).toBe(true);
    expect(flags.community).toBe(true);
    expect(flags.doubts).toBe(true);
  });

  it("accepts common truthy spellings", () => {
    const flags = parseMenuFeatureRows([
      { key: "menu_doubts", value: " ON " },
      { key: "menu_reports", value: "1" },
      { key: "menu_messages", value: "nope" },
    ]);
    expect(flags.doubts).toBe(true);
    expect(flags.reports).toBe(true);
    expect(flags.messages).toBe(false);
  });
});
