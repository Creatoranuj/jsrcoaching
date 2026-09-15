// Shared answer-matcher for quizzes. Supports MCQ (`correct_answer` stored as
// option index, letter, or option text), true/false, and numerical. Kept
// dependency-free so it can be mirrored verbatim in the edge function.

export function normalizeMcqIndex(
  answer: string | null | undefined,
  options: string[] | null | undefined,
): number | null {
  if (answer === null || answer === undefined) return null;
  const raw = String(answer).trim();
  if (raw === "") return null;
  const opts = Array.isArray(options) ? options : [];

  // Numeric index ("0", "1", ...)
  if (/^\d+$/.test(raw)) {
    const idx = parseInt(raw, 10);
    if (idx >= 0 && (opts.length === 0 || idx < opts.length)) return idx;
  }

  // Single letter ("A", "b", "C.")
  const letterMatch = raw.match(/^([A-Za-z])[).\s]?$/);
  if (letterMatch) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && (opts.length === 0 || idx < opts.length)) return idx;
  }

  // Option text (exact, then case/whitespace insensitive)
  if (opts.length > 0) {
    const exact = opts.findIndex((o) => String(o) === raw);
    if (exact >= 0) return exact;
    const loose = raw.toLowerCase();
    const ci = opts.findIndex((o) => String(o).trim().toLowerCase() === loose);
    if (ci >= 0) return ci;
  }

  return null;
}

function normalizeTF(v: string | null | undefined): "true" | "false" | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "t" || s === "1" || s === "yes") return "true";
  if (s === "false" || s === "f" || s === "0" || s === "no") return "false";
  return null;
}

function normalizeNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function isAnswerCorrect(
  userAnswer: string | null | undefined,
  correctAnswer: string | null | undefined,
  questionType: string | null | undefined,
  options: string[] | null | undefined,
): boolean {
  if (userAnswer === null || userAnswer === undefined || String(userAnswer).trim() === "") {
    return false;
  }
  if (correctAnswer === null || correctAnswer === undefined) return false;

  const type = String(questionType || "mcq").toLowerCase();

  if (type === "true_false" || type === "truefalse" || type === "tf") {
    const u = normalizeTF(userAnswer);
    const c = normalizeTF(correctAnswer);
    return u !== null && c !== null && u === c;
  }

  if (type === "numerical" || type === "number" || type === "numeric") {
    const u = normalizeNumber(userAnswer);
    const c = normalizeNumber(correctAnswer);
    if (u === null || c === null) return false;
    return Math.abs(u - c) < 1e-6;
  }

  // MCQ (default)
  const u = normalizeMcqIndex(userAnswer, options);
  const c = normalizeMcqIndex(correctAnswer, options);
  if (u === null || c === null) {
    // Fallback to raw trimmed equality (case-insensitive)
    return String(userAnswer).trim().toLowerCase() ===
      String(correctAnswer).trim().toLowerCase();
  }
  return u === c;
}