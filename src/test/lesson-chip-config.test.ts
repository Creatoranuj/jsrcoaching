import { describe, expect, it } from "vitest";
import {
  chipScopeTypeFor,
  parseLessonChipConfig,
  resolveLessonChipScope,
  serializeLessonChipConfig,
} from "@/features/lesson/lib/lessonChipConfig";
import { buildLessonChips, firstPanelChipId, isPanelChipEnabled } from "@/features/lesson/lib/lessonChips";

const base = { hasNotes: false, isAdminOrTeacher: false, hasLiked: false, likeCount: 0 };

describe("lesson chip config", () => {
  it("returns an empty config for missing or broken JSON", () => {
    expect(parseLessonChipConfig(null)).toEqual({ types: {}, lessons: {} });
    expect(parseLessonChipConfig("{oops")).toEqual({ types: {}, lessons: {} });
  });

  it("round-trips through serialize/parse", () => {
    const config = parseLessonChipConfig(
      serializeLessonChipConfig({
        types: { PDF: { hidden: ["rating"], custom: [{ id: "c1", label: "Buy", icon: "attachment", url: "https://x.dev", order: 0 }] } },
        lessons: {},
      }),
    );
    expect(config.types.PDF.hidden).toEqual(["rating"]);
    expect(config.types.PDF.custom[0].label).toBe("Buy");
  });

  it("maps lecture types onto scopes", () => {
    expect(chipScopeTypeFor("DPP_ATTEMPT")).toBe("DPP");
    expect(chipScopeTypeFor("pdf")).toBe("PDF");
    expect(chipScopeTypeFor("VIDEO")).toBe("LECTURE");
  });

  it("merges the lesson override on top of the type default", () => {
    const config = parseLessonChipConfig(JSON.stringify({
      types: { PDF: { hidden: ["timeline"], custom: [] } },
      lessons: { "l1": { hidden: ["rating"], custom: [{ id: "c1", label: "Site", icon: "attachment", url: "https://x.dev", order: 0 }] } },
    }));
    const scope = resolveLessonChipScope(config, "PDF", "l1");
    expect(scope.hidden.sort()).toEqual(["rating", "timeline"]);
    expect(scope.custom).toHaveLength(1);
  });
});

describe("buildLessonChips with admin config", () => {
  it("drops hidden built-ins and appends custom link chips", () => {
    const chips = buildLessonChips({
      ...base,
      hiddenChipIds: ["rating", "timeline"],
      customChips: [{ id: "c1", label: "Site", icon: "attachment", url: "https://x.dev", order: 0 }],
    });
    const ids = chips.map((c) => c.id);
    expect(ids).not.toContain("rating");
    expect(ids).not.toContain("timeline");
    expect(ids).toContain("c1");
    expect(chips.find((c) => c.id === "c1")?.action).toBe("link");
  });

  it("reports whether a deep-linked panel chip is still enabled", () => {
    const chips = buildLessonChips({ ...base, flags: { chipTimeline: false } });
    expect(isPanelChipEnabled(chips, "timeline")).toBe(false);
    expect(isPanelChipEnabled(chips, "comments")).toBe(true);
    expect(firstPanelChipId(chips)).toBe("comments");
  });

  it("never treats the like chip as a panel", () => {
    const chips = buildLessonChips(base);
    expect(isPanelChipEnabled(chips, "like")).toBe(false);
  });
});
