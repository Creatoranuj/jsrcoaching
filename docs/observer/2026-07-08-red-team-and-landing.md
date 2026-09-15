# Observer Report — 2026-07-08 — Red-team sweep + Landing rebrand

**Window observed:** current session
**Scope:** security posture + landing page social-link rebrand

## Red-team scan snapshot (all 7 scanners)

| Scanner | Findings | Verdict |
| --- | --- | --- |
| agent_security | 0 | clean |
| app_mcp / app_mcp_deep | 0 | clean |
| connector_security_scan | 0 | clean |
| supabase | 0 | clean |
| supabase_lov | 0 | clean |
| supply_chain | 0 | clean |

**Rating (attacker POV): 4/5** — no persisted CRITICAL/HIGH. The 25-vector matrix from `red-team-security-audit` requires manual PoC per finding; nothing new to prove today because prior turns already fixed `bunny_cdn_path` and `comment_images_upload_no_ownership_scope`.

## Incomplete / Follow-up (from prior sessions, still open)

- [ ] Playwright regression: stub `capacitor-razorpay` to throw `{code:"BAD_REQUEST_ERROR", step:"payment_authentication"}` and assert friendly toast + spinner reset (called out earlier as "backlog").
- [ ] Supabase linter shows 109 pre-existing WARN entries (public-bucket listing on 3 buckets, GraphQL anon exposure on several public tables). Not introduced today — audit + decision needed via `supabase-architect-auditor`.

## Landing rebrand — applied this turn

Social links (Telegram `t.me/safarenglishka`, YouTube `@safarenglishka`) placed at 3 highest-intent student touchpoints:

1. **New `CommunityStrip` section** (`src/components/Landing/CommunityStrip.tsx`) between `WhyChooseUs` and `LeadForm` — captures the student who is convinced by the pitch but not ready to fill a form. Two branded CTAs (Telegram blue, YouTube red) with haptic feedback.
2. **Footer social row** — replaced placeholder Facebook/LinkedIn/Twitter icons with real Telegram + YouTube icons pointing to your handles (`src/components/Landing/Footer.tsx`).
3. **`site_settings` seed** — inserted `telegram_url` + `youtube_url` so the dynamic `SocialLinks` component + admin panel show them everywhere (dashboard, community, chat widget, wherever it's mounted).

## Wins
- Security scanners all zero.
- New landing section is lazy-loaded via `lazyWithRetry` — no cold-start regression.
- Links open in new tab with `rel="noopener noreferrer"` (no window.opener leak — vector #12 red-team compliant).

## Notes on visibility
- Tool activity (migrations, edits) is not indexed in chat search. This report is the audit trail.
- Full 25-vector red-team PoC walk was NOT executed today — scanner snapshot only. Say "run the full red-team PoC" to trigger vector-by-vector probing.
