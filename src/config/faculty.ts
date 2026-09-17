/**
 * Single source of truth for the institute's teaching persona.
 *
 * Why: the founder/mentor name was hardcoded in ~10 UI files and in two edge
 * function prompts, so a rename left half the app (and the AI's own answers)
 * on the old name. Import from here instead of typing the name again.
 * The edge-function mirror lives in `supabase/functions/_shared/persona.ts`.
 */
export const FOUNDER_NAME = "Pankaj Sir";
export const FOUNDER_HONORIFIC = "Pankaj Sir Ji";
export const FOUNDER_INITIALS = "PS";
export const AI_ASSISTANT_NAME = "JSR AI Sahayak";

/** Names the Ask-a-Doubt panel may show as the responder. */
export const ASK_TEACHERS = [FOUNDER_NAME, AI_ASSISTANT_NAME, "Sahayak"] as const;
