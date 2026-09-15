import { describe, it, expect } from "vitest";
import { isAnswerCorrect, normalizeMcqIndex } from "../lib/quizAnswer";

const opts = ["Cramming", "Spaced repetition", "Highlighting", "Re-reading"];

describe("normalizeMcqIndex", () => {
  it("parses numeric string", () => expect(normalizeMcqIndex("2", opts)).toBe(2));
  it("parses letter", () => expect(normalizeMcqIndex("B", opts)).toBe(1));
  it("parses letter with dot", () => expect(normalizeMcqIndex("c.", opts)).toBe(2));
  it("matches option text", () => expect(normalizeMcqIndex("Spaced repetition", opts)).toBe(1));
  it("matches case-insensitive text", () => expect(normalizeMcqIndex("  cramming ", opts)).toBe(0));
  it("returns null for garbage", () => expect(normalizeMcqIndex("xyz", opts)).toBeNull());
  it("returns null for empty", () => expect(normalizeMcqIndex("", opts)).toBeNull());
});

describe("isAnswerCorrect - MCQ", () => {
  it("index user answer vs text correct_answer", () => {
    expect(isAnswerCorrect("1", "Spaced repetition", "mcq", opts)).toBe(true);
  });
  it("index user answer vs index correct_answer", () => {
    expect(isAnswerCorrect("1", "1", "mcq", opts)).toBe(true);
  });
  it("text user answer vs text correct_answer", () => {
    expect(isAnswerCorrect("Spaced repetition", "Spaced repetition", "mcq", opts)).toBe(true);
  });
  it("wrong answer", () => {
    expect(isAnswerCorrect("0", "Spaced repetition", "mcq", opts)).toBe(false);
  });
  it("skipped (empty) is not correct", () => {
    expect(isAnswerCorrect("", "1", "mcq", opts)).toBe(false);
  });
});

describe("isAnswerCorrect - true/false", () => {
  it("matches lowercase", () => expect(isAnswerCorrect("true", "True", "true_false", null)).toBe(true));
  it("matches t / true", () => expect(isAnswerCorrect("t", "true", "true_false", null)).toBe(true));
  it("mismatched", () => expect(isAnswerCorrect("false", "true", "true_false", null)).toBe(false));
});

describe("isAnswerCorrect - numerical", () => {
  it("integer match", () => expect(isAnswerCorrect("42", "42", "numerical", null)).toBe(true));
  it("trailing zeros", () => expect(isAnswerCorrect("3.140", "3.14", "numerical", null)).toBe(true));
  it("whitespace", () => expect(isAnswerCorrect(" 25 ", "25", "numerical", null)).toBe(true));
  it("mismatch", () => expect(isAnswerCorrect("41", "42", "numerical", null)).toBe(false));
});