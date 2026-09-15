# Fix: Safar Agent (chat widget) + Ask Doubt

## Current state (verified just now)
- `ai-health` on the live project returns `{"ok":true}` — the AI gateway key itself is working right now with `google/gemini-3.6-flash`.
- The screenshot copy ("AI service अभी available नहीं है — server key issue") is produced only when the edge function returns `code: gateway_unauthorized` or `not_configured`.
- `chatbot` without a session returns HTTP 401, so the failure students see is not reproducible from outside the app; the exact upstream reason is only in the function response/logs.
- Two real misclassification bugs are visible in the code and can produce that copy even when the key is fine:
  - `resolve-doubt` treats any upstream body containing the word `unauthorized` as a key failure.
  - `chatbot` uses the admin-saved model from settings; an invalid/unsupported model id returns a 4xx that gets surfaced as a hard failure instead of a clean fallback.

Root cause is therefore not yet proven — step 1 of this plan is to capture it, not to guess.

## What will be done

### 1. Capture the real error (diagnostics first)
- Add an admin-only diagnostic action that calls the same code path both features use and returns the raw upstream status + first bytes of the gateway body (never the key).
- Surface it in the existing Admin area next to "PDF Source Health" as "AI Health / Diagnostics", showing: key present, gateway ping, chatbot model in use, resolve-doubt ping.

### 2. Fix classification so students never see a false "key issue"
- `resolve-doubt`: only `lovable_api_key_not_registered` (or an explicit gateway auth `type`) maps to `gateway_unauthorized`; drop the loose `includes("unauthorized")` check. Everything else becomes a neutral retryable error.
- Keep `chatbot`'s already-tight check and align both functions on one shared classifier in `_shared/aiGateway.ts`.

### 3. Make the chatbot model self-healing
- Validate the admin-saved model against a small allowlist of currently supported ids; anything unknown falls back to `google/gemini-3.6-flash` and logs a warning, instead of failing the turn.
- One retry on the fallback model when the configured model returns a 400/404 model error.

### 4. Ask Doubt reliability
- Same fallback + classification for `resolve-doubt`, and forward the function's own localised message to the UI (chat widget already prefers `response`; the lesson-chat hook will do the same).

### 5. Verify
- Re-run `ai-health`, run the new admin diagnostics, then send one real message through Safar Agent and one through Ask Doubt and confirm a real answer (not a fallback string).
- If the diagnostics show a genuine key/credit problem instead, the fix becomes rotating/creating `LOVABLE_API_KEY` and I will report that explicitly.

## Technical notes
- Files: `supabase/functions/_shared/aiGateway.ts`, `supabase/functions/chatbot/index.ts`, `supabase/functions/resolve-doubt/index.ts`, `supabase/functions/ai-health/index.ts`, plus a small admin diagnostics page/route and `src/hooks/useLessonChat.ts`.
- No database schema change, no new dependency, no change to PDF/knowledge-hub code.
