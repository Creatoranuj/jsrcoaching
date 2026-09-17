/**
 * Single source of truth for institute + faculty naming shown anywhere in the UI.
 *
 * Why this exists: the founder's name was hardcoded in 10+ files (landing page,
 * lesson mentor panel, exam tracks, admin defaults, AI chat labels). A rebrand
 * meant a repo-wide grep-and-hope. Import from here instead.
 *
 * The edge-function twin lives in `supabase/functions/_shared/persona.ts`
 * (Deno cannot import from `src/`). Change both together.
 */

export const INSTITUTE_NAME = "JSR Coaching";

/** Founder / lead mentor — plain name, used in cards, bylines, alt text. */
export const FOUNDER_NAME = "Pankaj Sir";
/** Respectful form used when the AI or marketing copy refers to him. */
export const FOUNDER_HONORIFIC = "Pankaj Sir Ji";
/** Avatar initials. */
export const FOUNDER_INITIALS = "PS";

/** The AI study assistant's display name. */
export const AI_ASSISTANT_NAME = "JSR AI Sahayak";

/** Names the Ask-a-Doubt chat rotates through as the "answering" teacher. */
export const ASK_TEACHERS: string[] = [FOUNDER_NAME, AI_ASSISTANT_NAME, "Sahayak"];
