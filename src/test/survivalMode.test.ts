import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  FEATURE_SWITCHES,
  EDGE_FUNCTION_SWITCHES,
  PROTECTED_KEYS,
  ALL_SWITCH_KEYS,
  SURVIVAL_MODE_OFF_KEYS,
  edgeSwitchKey,
  isProtected,
  parseSwitchValue,
  parseSwitchRows,
  isFeatureOn,
  isEdgeFunctionOn,
} from "@/lib/systemSwitches";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("survival mode — missing key = ON", () => {
  it("treats missing / empty values as ON", () => {
    expect(parseSwitchValue(undefined)).toBe(true);
    expect(parseSwitchValue(null)).toBe(true);
    expect(parseSwitchValue("")).toBe(true);
    expect(parseSwitchValue("true")).toBe(true);
  });

  it("treats only explicit off-values as OFF", () => {
    for (const v of ["false", "0", "off", "no", "FALSE", " Off "]) {
      expect(parseSwitchValue(v)).toBe(false);
    }
  });

  it("returns ON when no switches have been loaded yet", () => {
    expect(isFeatureOn("doubts", undefined)).toBe(true);
    expect(isFeatureOn("doubts", {})).toBe(true);
    expect(isEdgeFunctionOn("chatbot", null)).toBe(true);
  });

  it("only reads sys_* rows from site_settings", () => {
    const map = parseSwitchRows([
      { key: "sys_feature_doubts", value: "false" },
      { key: "some_other_setting", value: "false" },
    ]);
    expect(map["sys_feature_doubts"]).toBe(false);
    expect(map["some_other_setting"]).toBeUndefined();
  });
});

describe("survival mode — protected paths can never be switched off", () => {
  const criticalPaths = [
    "login",
    "signup",
    "my-courses",
    "course",
    "chapter",
    "lesson",
    "pdf",
    "video",
    "payment",
    "verify-razorpay-payment",
    "razorpay-webhook",
    "get-lesson-url",
    "score-quiz",
  ];

  it("lists every critical path as protected", () => {
    for (const name of criticalPaths) {
      expect(isProtected(name), `${name} must be protected`).toBe(true);
    }
  });

  it("keeps protected edge functions ON even when the DB says false", () => {
    for (const name of criticalPaths) {
      const off = { [edgeSwitchKey(name)]: false } as Record<string, boolean>;
      expect(isEdgeFunctionOn(name, off), `${name} must stay ON`).toBe(true);
    }
  });

  it("never puts a protected key in the Survival Mode master off-list", () => {
    for (const key of SURVIVAL_MODE_OFF_KEYS) {
      const fn = key.startsWith("sys_edge_")
        ? key.slice("sys_edge_".length).replace(/_/g, "-")
        : key;
      expect(isProtected(fn), `${key} must not be switchable off`).toBe(false);
    }
  });

  it("does not expose a switch for any protected edge function", () => {
    for (const fn of EDGE_FUNCTION_SWITCHES) {
      expect(isProtected(fn), `${fn} should not be listed as toggleable`).toBe(false);
    }
  });
});

describe("survival mode — switch inventory", () => {
  it("covers 13 features and 26 edge functions", () => {
    expect(Object.keys(FEATURE_SWITCHES)).toHaveLength(13);
    expect(EDGE_FUNCTION_SWITCHES).toHaveLength(26);
    expect(ALL_SWITCH_KEYS).toHaveLength(39);
    expect(new Set(ALL_SWITCH_KEYS).size).toBe(ALL_SWITCH_KEYS.length);
  });

  it("keeps the protected list non-empty and unique", () => {
    expect(PROTECTED_KEYS.length).toBeGreaterThan(20);
    expect(new Set(PROTECTED_KEYS).size).toBe(PROTECTED_KEYS.length);
  });
});

describe("survival mode — admin wiring stays in place", () => {
  it("exposes /admin/system behind the admin route guard", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/admin/system"');
    expect(app).toMatch(/path="\/admin\/system"\s+element=\{<AdminRoute/);
  });

  it("renders the survival banner in the app shell", () => {
    expect(read("src/App.tsx")).toContain("<SurvivalBanner />");
  });

  it("links the control room from the Admin home", () => {
    expect(read("src/pages/Admin.tsx")).toContain("/admin/system");
  });

  it("keeps the admin page gated on isAdmin", () => {
    const page = read("src/pages/AdminSystem.tsx");
    expect(page).toContain("isAdmin");
    expect(page).toContain("SystemSwitchManager");
  });

  it("guards edge functions through the shared helper", () => {
    expect(read("supabase/functions/_shared/systemSwitch.ts").length).toBeGreaterThan(0);
  });
});
