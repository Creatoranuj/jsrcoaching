# Fix mobile overlap/overflow + AI service (Ask Doubt & chatbot)

## 1. The circled bar — batch selector

Two separate bugs in the same row:

- The title row inside the select trigger is a flex row with no width floor, so `truncate` never
  activates and the long title plus the grade suffix push past the box (and under the dropdown arrow).
- The label reads "Class 12 Batch 2027 (Class Class 12)" because the course's grade value is already
  `"Class 12"` in the database, and the UI prefixes another "Class ".

Fix: give the row a proper shrinking column (`flex-1 min-w-0`, truncate the whole line as one string),
reserve room for the chevron, and print the grade exactly as stored (no extra "Class " prefix).
Same correction applied to the dropdown list items.

## 2. Root cause — where else this happens

Two systemic patterns cause every overlap on the app's mobile screens:

```text
A. text that must shrink lives in a flex row with no min-w-0
   -> truncate/line-clamp never fires -> text spills over neighbours
B. a box with a locked height (aspect ratio / fixed h-) holds a
   growing text+button stack -> content is clipped or sits under
   floating controls (arrows, dots, ribbons, bottom nav)
```

Confirmed instances to fix in this pass:

| Place | Problem | Fix |
| --- | --- | --- |
| Batch selector | pattern A | shrinking column + grade text fix |
| Home hero banner (NEET 2026 slide) | pattern B — at 360px the slide is only ~150px tall while badge + 2-line title + subtitle + button need more, so the button gets clipped; the dot indicators also sit on top of the button | give the slide a minimum height on mobile, tighten the mobile text stack, reserve bottom padding so dots never cover the button |
| Hero loading skeleton | 176px placeholder vs ~150px real slide → content jumps on load | match the skeleton to the real height |
| Course cards | four floating badges (grade, FREE, Enrolled, play, rating) positioned independently; on a 2-column phone grid they can collide | let the badge groups wrap and cap their width |
| Downloads page | relies only on a global rule to clear the bottom nav; the last row can hide under it | add the same explicit bottom padding the Library page already uses |

Guard against regressions: extend the existing `scripts/check-design-tokens.mjs`-style lint with a small
check that flags `truncate`/`line-clamp` inside a flex row when neither the item nor the row has
`min-w-0`, so the pattern cannot creep back in.

Verification: render Dashboard, Courses, My Courses, Lesson view, Library and Downloads at 360x740
and 390x844 in a headless browser and compare screenshots before/after.

## 3. P2 — "AI service अभी configure हो रही है" and Ask Doubt

Verified root cause from the live edge-function logs: every AI call returns

```text
403 lovable_api_key_not_registered — "LOVABLE_API_KEY is not registered for this project"
```

The model itself is fine (a successful call is recorded in the gateway log). The key stored in Supabase
secrets no longer belongs to this project, so `chatbot`, `resolve-doubt` (Ask Doubt), lesson chat,
summarise-video, deep-search and embeddings all fail the same way.

Fix:

1. Rotate the Lovable AI key so the project's own key is written into Supabase secrets.
2. Redeploy the AI edge functions so they pick the new key up, then confirm with a live call that the
   chatbot and Ask Doubt both answer (checking the function logs for a clean 200).
3. While the key is genuinely missing, the message should be honest and actionable instead of the
   current "configure हो रही है — कुछ मिनट बाद try करें": show an admin-facing wording plus a Retry
   button in the chat widget and in Ask Doubt, so a student never sees a dead end.

## Technical notes

- Files: `src/components/dashboard/BatchSelector.tsx`, `src/components/dashboard/HeroCarousel.tsx`,
  `src/components/courses/CourseCard.tsx`, `src/pages/Downloads.tsx`,
  `src/components/chat/ChatWidget.tsx`, `src/components/lesson/AskDoubtSheet.tsx`,
  plus a small lint script under `scripts/`.
- No database migration is needed; the grade value stays as-is in the database and only the display
  changes.
- Key rotation touches Supabase secrets and redeploys `chatbot`, `resolve-doubt`, `ai-health`,
  `summarize-video`, `deep-search-lecture`, `generate-embedding`.
