import { describe, it, expect } from "vitest";
import {
  moveItem,
  positionUpdates,
  reorderByIndex,
  reorderByStep,
} from "@/lib/reorderPositions";

const list = [
  { id: "a", position: 0 },
  { id: "b", position: 1 },
  { id: "c", position: 2 },
];

describe("reorderPositions", () => {
  it("moves an item down", () => {
    expect(moveItem(list, 0, 2).map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("is a no-op for out-of-range indexes", () => {
    expect(moveItem(list, 0, 9).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(moveItem(list, -1, 1).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("emits only changed rows", () => {
    const { ordered, updates } = reorderByIndex(list, 0, 1);
    expect(ordered.map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(updates).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });

  it("normalizes duplicate / gapped legacy positions", () => {
    const legacy = [
      { id: "a", position: 5 },
      { id: "b", position: 5 },
      { id: "c", position: null },
    ];
    expect(positionUpdates(legacy)).toEqual([
      { id: "a", position: 0 },
      { id: "b", position: 1 },
      { id: "c", position: 2 },
    ]);
  });

  it("steps up and down", () => {
    expect(reorderByStep(list, "c", "up").ordered.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(reorderByStep(list, "a", "down").ordered.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("does nothing at the edges", () => {
    expect(reorderByStep(list, "a", "up").updates).toEqual([]);
    expect(reorderByStep(list, "c", "down").updates).toEqual([]);
    expect(reorderByStep(list, "zzz", "up").updates).toEqual([]);
  });
});
