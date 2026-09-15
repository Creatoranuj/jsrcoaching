/**
 * Sanitize user-supplied text before it enters an LLM system/user prompt.
 * Strips angle brackets and neutralizes common prompt-injection phrases.
 * Always wrap sanitized content inside <lesson_context ...> tags labelled as
 * UNTRUSTED so the model treats it as data, not instructions.
 */
export function sanitizeAiField(v: unknown, max = 1500): string {
  return String(v ?? "")
    .replace(/[<>]/g, "")
    // Cover "ignore [all|any] [previous|prior] instructions/prompts/rules" —
    // both the 2-adjective and 3-adjective forms.
    .replace(
      /ignore\s+(?:all\s+|any\s+)?(?:previous\s+|prior\s+)?(instructions?|prompts?|rules?)/gi,
      "[filtered]",
    )
    .replace(/system\s*[:-]/gi, "[filtered]")
    .replace(/you\s+are\s+now\s+/gi, "[filtered]")
    .slice(0, max);
}
