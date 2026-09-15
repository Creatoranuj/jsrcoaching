# Human Tone + Visual Polish Audit — 2026-07-20

**Skills used:** `human-tone-ui` (new) · `lovable-design-language` · `senior-architect-audit`
**Scope:** end-to-end string/tone + visual sweep of Downloads, Profile/Settings, common empty states, and toasts.
**Verdict — 3.4 / 5.** Structure and design tokens are solid, but copy is still visibly AI-generated in several high-traffic surfaces. No CRITICAL. 8 HIGH, ~15 MEDIUM.

This is a **findings-only** report per user instruction ("no edit"). Fixes will land in a follow-up ship turn.

---

## Findings

### [HIGH] [TONE] Toast copy is generic & shouty in Profile + Settings
**Where:** `src/pages/Settings.tsx:144,147,166,228` · `src/pages/Profile.tsx:83,88,95`
**Why it matters:** `"Settings saved!"`, `"Password changed successfully!"`, `"Profile updated successfully!"`, `"Logged out successfully"`, `"Your deletion request has been submitted. You will receive an email within 7 days."` — all violate the ≤5-word / past-tense / no-exclamation rule. Reads like an LLM's stock success line, not a product. Compare Linear ("Saved") and Lovable ("Updated").
**Fix:** `Saved` · `Password badla` · `Profile updated` · `Logged out` · `Deletion request bhej diya — 7 din me email aayega.`

### [HIGH] [TONE] Error toasts explain nothing actionable
**Where:** `src/pages/Settings.tsx:147,194,231` · `src/pages/Profile.tsx:72,88`
**Why it matters:** `"Failed to save settings"` / `"Failed to update profile"` / `"Network error. Please check your connection and try again."` all say what broke but no verb the user can act on. The tone-skill rule is `[what broke] — [what to do]`.
**Fix:** `Settings save nahi ho paaye — dobara try karo.` · `Profile update nahi hua — internet check karke Retry.`

### [HIGH] [TONE][VIS] `Sparkles` icon still used as AI/agent mascot in 8 places
**Where:** `src/pages/LessonView.tsx`, `src/pages/LiveClass.tsx`, `src/components/lesson/AskDoubtSheet.tsx`, `src/components/lesson/TopicsCovered.tsx`, `src/components/lecture/ObsidianNotes.tsx`, `src/components/live/LiveSarthiPanel.tsx`, `src/components/video/VideoSummarizer.tsx`, `src/components/SubscriptionPaywall.tsx`
**Why it matters:** Sparkles is the universal "AI-generated" tell. `chat-ui-composition` and `human-tone-ui` both forbid it as identity. Replace with a domain-specific mark (the Safar brand glyph, or a stroked `MessageCircleQuestion`/`Wand2` when denoting an action, never as the app/agent's face).
**Fix:** Swap for the existing `<AppLogo>` where the icon represents an AI agent; keep other lucide icons if they're purely functional (button glyph, not identity).

### [HIGH] [TONE] Empty states use "No X yet" formula across 14 pages
**Where:** `Doubts.tsx`, `ChapterView.tsx`, `Materials.tsx`, `AdminLiveManager.tsx`, `Reports.tsx`, `Books.tsx`, `AllTests.tsx`, `AdminUpload.tsx`, `AdminSchedule.tsx`, `MyCourses.tsx`, and 4 more.
**Why it matters:** The `human-tone-ui` empty-state contract is 3 lines: what's missing → how to fix → one CTA. Right now every empty state is a bare `<p>No X yet</p>` with no next action. User sees a dead screen.
**Fix template:**
```
[folder/book icon]
{Books: `Yahaan koi book nahi hai.`}
{Books: `Admin book upload karega tab yahaan aayegi.`}
[optional CTA]
```

### [HIGH] [VIS] `AdminUpload.tsx:1413` uses AI-generated-sounding CTA
**Where:** `"No content yet. Upload the first item!"`
**Why it matters:** Exclamation + "the first item" is the exact stock LLM empty-state phrasing.
**Fix:** `Content khaali hai. Pehli upload karo.` + inline `[+ Upload]` button.

### [HIGH] [TONE] Downloads.tsx uses inconsistent success language
**Where:** `src/pages/Downloads.tsx:283, 309, 202, 209`
**Why it matters:** `"Added to My Library"` is fine; `"Choose where to save the file"` is instructional, not a toast; `"Offline copy missing. Re-download this file while online."` mixes tone registers (English formal in an otherwise Hinglish surface).
**Fix:** `Library me add ho gaya` · move "choose where" text to the OS-native picker sheet, not a toast · `Offline copy nahi mili — online aake dobara download karo.`

### [HIGH] [VIS] Profile page uses `md`-sized avatar (h-20 w-20) but no ring/focus treatment
**Where:** `src/pages/Profile.tsx` header
**Why it matters:** With the blink fix landing, the avatar is now stable, but it still lacks the Lovable-style hairline ring + soft shadow to feel premium. Currently just border-2 border-background.
**Fix (later turn):** `ring-1 ring-border/60 shadow-[0_2px_8px_rgba(0,0,0,0.08)]` + subtle scale-on-press for the onClick variant.

### [HIGH] [TONE] "Successfully" filler word appears 6+ times
**Where:** `Settings.tsx:166`, `Profile.tsx:83`, `Profile.tsx:95`, others
**Why it matters:** "Successfully" is a hallmark AI filler. Past-tense verb already conveys success.
**Fix:** delete every `successfully`.

---

## Medium (batch fix)

- [MEDIUM] [TONE] `"Role refreshed"` (Profile.tsx:198) is fine; `"Session terminated"` (Settings.tsx:191) is fine; keep as-is.
- [MEDIUM] [TONE] Every admin `AlertDialog` uses default `Cancel` + `Confirm` labels via `ConfirmDialog`. Should name the outcome (`Delete forever` / `Turn off`).
- [MEDIUM] [VIS] Empty-state icons across the app are mixed sizes (`h-8`, `h-12`, `h-16`). Lovable uses a 48px gradient tile consistently.
- [MEDIUM] [A11Y] Toasts don't announce via `aria-live` region for role=`status` — Sonner defaults are fine but confirm.
- [MEDIUM] [TONE] Any `console.log`-style error surfacing in `LessonView` doubt errors should route through `logError` and show human toast (already partially done; verify the remaining paths).
- [MEDIUM] [TONE] `AdminSchedule.tsx:163` — `"No lectures scheduled yet"` add `Schedule ek naya button dabao` + CTA.
- [MEDIUM] [VIS] `Books.tsx:132` header `"No books yet"` is centered text without hierarchy — use gradient tile pattern.
- [MEDIUM] [MOT] Empty-state elements have no entrance animation; a 200ms fade-in reduces the "dead screen" perception.
- [MEDIUM] [TONE] `pages/BackButtonDebug.tsx` is dev-only — exclude from tone pass.
- [MEDIUM] [TONE] `Doubts.tsx:713` `"No replies yet"` inside a thread is fine (contextual), no CTA needed.

---

## Wins (already right)

- Ask-Doubt error copy is properly Hinglish + verb-directed (`useLessonChat.ts`): `"AI service abhi reconnect ho raha hai. 10 second baad Retry dabao. 🙏"` — model for the rest of the app.
- `ConfirmDialog` provider centralizes destructive dialogs — one place to retrofit outcome-labeled buttons.
- Skeleton loaders (`ListCardSkeleton`) replaced spinners app-wide (previous ship).
- Dialog primitives already carry Lovable rounded-2xl + hairline shadow (previous ship).
- ProfileAvatar blink fixed this turn (module-level `loadedUrls` cache + fade-only-after-onload).
- My Local Storage now refreshes instantly on add (this turn — `useFolderItems` listens to `personalLibrary:refresh` + optimistic tile insert).

---

## Fix plan (next turn, if approved)

1. **Toast pass** (30 min) — replace all `"Successfully X"` → verb-past; error toasts → `[what] — [what to do]`.
2. **Empty-state pass** (60 min) — extract shared `<EmptyState icon title body cta>` primitive; retrofit 14 pages.
3. **Sparkles purge** (20 min) — swap the 8 identity uses for `<AppLogo>` or a domain glyph.
4. **ConfirmDialog outcome labels** (15 min) — call-sites pass `confirmLabel="Delete forever"` etc.
5. **Profile avatar ring + shadow** (5 min) — add Lovable-style hairline ring.

Cost: ~2.5 hours of implementation, zero regression surface.

---

## Open Questions

1. Should the "Successfully → verb" toast pass ship as one PR, or split by page owner (Profile/Settings/Admin)?
2. Do you want a shared `<EmptyState>` component in the tone pass, or inline retrofit?
3. Keep the 🙏 emoji in the AI reconnect toast (Ask-Doubt) — it's warm, on-brand, and the only defensible emoji in the app? Or purge for consistency?
