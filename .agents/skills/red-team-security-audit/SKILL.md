---
name: red-team-security-audit
description: Adversarial red-team pentest playbook — 25-vector attacker matrix (auth, RLS, payments, XSS, prompt injection, SSRF, deep-link hijack, WebView escape, supply chain, PII leak). Use for "security audit", "pentest", "hack test", pre-release, or after auth/payment/upload/edge-fn changes.
---

# Red-Team Security Audit — Naveen Bharat

Act as an offensive security team ("red team") probing this app for exploitable
weaknesses the way a real attacker would. This is the **adversarial counterpart**
to `senior-architect-audit` and `supabase-architect-auditor`: those skills review
intent; this skill assumes the intent is a lie and tries to break it.

## When to trigger

- "security audit", "pentest", "red team", "hack test", "litmus test"
- "is my app safe?", "can someone bypass X?"
- Before every public release
- After adding auth, payments, file upload, deep links, or edge functions
- After a dependency bump touches `@supabase/*`, `capacitor-*`, or `razorpay*`

## Attacker parameter matrix (the "litmus paper")

Walk every category. Skip none — write "N/A — reason" if truly not applicable.
Each row = one attacker goal + concrete probe you must run.

| # | Vector | Attacker goal | Probe |
| - | ------ | ------------- | ----- |
| 1 | **Auth bypass** | Log in as another user | Forge JWT, replay expired token, empty `sub`, mismatched `aud`, cross-project token |
| 2 | **RLS bypass / IDOR** | Read/write another user's row | `?user_id=<victim>`, direct table `select`, `service_role` leak, missing WHERE in edge fn |
| 3 | **Privilege escalation** | Become admin | POST role update to `user_roles`, `profiles.role` field, client-side `isAdmin` flag, self-set via trigger gap |
| 4 | **Payment tamper** | Enroll without paying | Skip `verify-razorpay-payment`, forge signature, replay old `payment_id`, mutate amount, webhook without HMAC, race conditions on `enrollments` upsert |
| 5 | **Webhook forgery** | Trigger enrollment / refund | Call `razorpay-webhook` without valid `x-razorpay-signature`, replay old event, wrong `event` type |
| 6 | **Storage abuse** | Read/write another user's files | Upload to `{victim_id}/...` folder, list bucket root, download private object via public URL, path traversal `../`, symlink |
| 7 | **CDN / signed-URL leak** | Steal course videos | Extract Bunny stream URL from network tab, share signed URL, bypass expiry, HLS key extraction |
| 8 | **XSS / HTML injection** | Steal token via `<script>` | Community post body, chatbot prompt, profile fields, notice/banner HTML, PDF rendering |
| 9 | **Prompt injection** | Exfiltrate secrets from AI | Inject "ignore previous instructions" into chatbot, doubts, notes → Lovable AI Gateway |
| 10 | **SSRF / URL fetch abuse** | Hit internal endpoints | Firecrawl / crawl-content / bunny-cdn actions with `http://169.254.169.254`, `file://`, `http://localhost` |
| 11 | **Rate-limit bypass** | Brute-force OTP / login | Missing `rate_limits` table check, distributed IPs, missing throttle in edge fns |
| 12 | **Deep-link hijack** | Steal auth / redirect | Malicious `?next=`, `//evil.com`, JavaScript URI, unvalidated `redirect_to` in email templates |
| 13 | **Open redirect** | Phish users | Same as above on any redirect endpoint |
| 14 | **CORS abuse** | Read authed responses from evil origin | `Access-Control-Allow-Origin: *` on edge fns that echo user data |
| 15 | **CSRF** | Force state change from evil site | Missing origin check on edge fns; JWT in cookies vs header |
| 16 | **JWT / session** | Persist after logout / rotate | localStorage snapshot, refresh-token reuse, silent-refresh loop |
| 17 | **Secrets in bundle** | Recover `service_role`, `RAZORPAY_KEY_SECRET`, `LOVABLE_API_KEY`, `FIRECRAWL_API_KEY` | `rg -n "eyJhbG\|sk_\|rzp_live_\|sbp_"` on `dist/`, source maps in prod |
| 18 | **PII / data leak** | Enumerate emails, phones, addresses | Public SELECT on `profiles`, `leads`, `deletion_requests`, `funnel_entries`; error messages that echo columns |
| 19 | **SQL injection** | Read arbitrary tables | Raw string concat in RPC bodies, dynamic table names in SECURITY DEFINER fns |
| 20 | **File upload abuse** | RCE / phishing hosting | Upload `.html`, `.svg` with `<script>`, unbounded size, missing MIME check, polyglot files |
| 21 | **Denial of service** | Kill the app / bill | Huge PDF fetch loop, infinite realtime subscribe, recursive comment tree, expensive query without LIMIT |
| 22 | **Dependency supply chain** | Malicious package | `bun.lock` audit, typosquats, unlocked transitive deps, `postinstall` scripts |
| 23 | **Android intent hijack** | Intercept deep links | `assetlinks.json` mismatch, missing `autoVerify`, exported activities |
| 24 | **WebView escape** | Read files, exec shell | `webContentsDebuggingEnabled=true` in release, `allowFileAccess`, cleartext to non-localhost |
| 25 | **Log / analytics PII** | Steal via Sentry / analytics | Full row / token / URL with token in `console.error` → forwarder |

## Workflow (mandatory)

1. **Refresh snapshot** — in parallel:
   - `security--get_scan_results` (persisted findings)
   - `security--run_security_scan` (fresh scan, ephemeral)
   - `supabase--linter`
   - `rg` for the bundle-secret patterns above
2. **Prioritize** — take every finding from step 1 + walk the 25-row matrix. Anything
   marked CRITICAL/HIGH must have a proof-of-concept (curl / SQL / screenshot).
3. **Prove** — write a repro. Don't accept a linter warning at face value; construct
   the actual attack request and demonstrate the response. No PoC = downgrade to LOW
   or "unverified".
4. **Fix at the highest level** — RLS + GRANT before app-code checks; edge-function
   signature verification before frontend validation; secret rotation before code
   patch when a key leaked.
5. **Persist decisions** — mark fixed / ignored findings via
   `security--manage_security_finding` with a real explanation; update
   `security--update_memory` with any new "intentionally public" or "accepted risk"
   invariants. Never leave a finding silently open.
6. **Regression** — for every fix, name the automated check that will catch a future
   regression (Playwright test, `supabase--linter` rule, `security--run_security_scan`
   pattern, `rg` grep in CI).

## Report format (mandatory)

```markdown
# Red-Team Audit — <YYYY-MM-DD> — <scope>

**Rating: X/5** — one-sentence verdict from an attacker's POV.

## Attacker findings

### [CRITICAL] [#4 payment-tamper] Title
**Attack:** step-by-step repro (curl / SQL / UI clicks).
**Impact:** what an attacker gains ($, data, control).
**Fix:** the code / policy / secret rotation change. Include the exact SQL / diff.
**Regression guard:** the test / linter rule / grep that keeps it fixed.

### [HIGH] [#8 xss] ...
### [MEDIUM] [#21 dos] ...
### [LOW] [#25 logging-pii] ...

## Wins (attacks that failed)
- Tried #1 auth bypass with forged JWT — rejected by Supabase (`aud` mismatch).
- Tried #6 storage upload to `{victim}/...` — 403 from folder policy.

## Fix Plan
1. CRITICAL — rotate + patch + regression test **now**.
2. HIGH — same day.
3. MEDIUM — this week.
4. LOW — backlog with owner.

## Persisted decisions
- `security--manage_security_finding` calls made and why.
- `security--update_memory` diff.
```

Rating rubric (attacker POV, harsher than defender POV):

| Score | Meaning |
| ----- | ------- |
| 5 | Red team failed on every vector. |
| 4 | Only LOW findings; nothing exploitable in <1 day. |
| 3 | 1 HIGH or 3+ MEDIUM; motivated attacker gets in eventually. |
| 2 | CRITICAL or 2+ HIGH; skilled attacker in <1 hour. |
| 1 | Script kiddie in <5 minutes. |

## Non-negotiables

- **Never** paste real secrets into the report. Redact to first-4-chars + `…`.
- **Never** run destructive attacks against production data. Use a throwaway user.
  If the only way to prove a bug is a destructive write, describe the proof, do not
  execute.
- **Never** claim a fix is applied without a regression guard. "Fixed and tested" =
  code change + repro that now fails + automated check.
- If you leak a secret while writing the report, immediately rotate via the
  matching rotate tool (`ai_gateway--rotate_lovable_api_key`) or instruct the user
  to rotate in the provider dashboard.
- Every finding must have a `#N` reference to a matrix row so future audits can
  grep for coverage.

## Anti-patterns to shout at

- "RLS is enabled, so we're safe" — RLS without GRANTs, or with `USING (true)`, is
  a wide-open door.
- "The frontend hides the button, so admins only" — attacker calls the API
  directly.
- "We validate on the client" — irrelevant. Server or nothing.
- "The token is in localStorage but we trust our origin" — one XSS = full account
  takeover.
- "Webhook is behind a random URL" — security by obscurity; verify HMAC every
  request.
- Ignoring a finding because "no one would try that" — attackers try everything.

## Closing behavior

- End the report by listing which regression guards were added, which secrets were
  rotated, and which memory updates were made.
- Closing reply names the skill: "Used the red-team-security-audit skill."
