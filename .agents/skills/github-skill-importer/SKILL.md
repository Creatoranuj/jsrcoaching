---
name: github-skill-importer
description: Auto-import Capacitor/Ionic/Razorpay skills from Cap-go/capgo-skills into .agents/skills/ in one shot. Trigger the instant the user says "import skill X", "add capgo skill(s)", "import from GitHub", "sync skills", or names any Cap-go skill that isn't active yet.
---

# GitHub Skill Importer (Capacitor · Razorpay · APK/CI)

## AUTO-IMPORT CONTRACT (read first)

When this skill activates and the user's request names one or more skills (or asks for "all capacitor skills"), execute the following **without a plan, without a clarifying question, without asking permission** — the user has already opted in by invoking this skill:

1. Run the bundled importer in a single shell call:
   ```bash
   bash .agents/skills/github-skill-importer/scripts/import-skill.sh <skill-name> [<skill-name> ...]
   # or, for the full curation matrix:
   bash .agents/skills/github-skill-importer/scripts/import-skill.sh --all-capacitor
   ```
   The script caches the Cap-go clone in `/tmp/capgo-skills` for 6h → subsequent imports skip the network entirely (zero-credit, sub-second).
2. Parse the `Next:` block from the script's stdout — it lists every `.agents/skills/<name>` path that was written.
3. Fire `skills--apply_draft` for **every** listed path **in one parallel batch** in the very next turn. Never sequentially — sequential apply_draft is what burns credits + time.
4. Reply to the user with a one-line summary (`imported: N skills — active now`). No per-skill essays.

If the request names a skill that already exists under `.agents/skills/`, still run the importer with that name — the script overwrites so upstream updates land. This is intentional.

If the user only asks "what skills can I import?" → run `import-skill.sh --list` and paste the output. Do not clone-and-copy in that case.

## Canonical source repos

| Repo | Purpose |
|---|---|
| `https://github.com/Cap-go/capgo-skills` | 49 official Capacitor + Ionic + Capgo skills (upstream) |
| `MrAnujBabu/35` (user's own) | Curated fork — Naveen Bharat's active skill set + project overrides |

Cap-go is upstream — never edit Cap-go skills in place. Copy → adapt (in the user's repo) → commit.

## Manual import procedure (fallback only — use the script above by default)

```bash
# 1. Fresh clone (shallow)
cd /tmp && rm -rf capgo-skills
git clone --depth 1 https://github.com/Cap-go/capgo-skills.git

# 2. Diff against active workspace
ls /tmp/capgo-skills/skills/ > /tmp/upstream.txt
ls .agents/skills/ > /tmp/local.txt
diff /tmp/upstream.txt /tmp/local.txt

# 3. Copy only the skills relevant to the current project's stack
for s in <skill-names>; do
  cp -r /tmp/capgo-skills/skills/$s .agents/skills/$s
done

# 4. Adapt SKILL.md frontmatter description if the project has specific triggers
#    (e.g. "Naveen Bharat uses this for X"). Never rewrite the body unless the
#    upstream guidance conflicts with a project-knowledge rule.

# 5. Apply each draft with skills--apply_draft (one call per skill)
```

## Curation matrix — what to pull, when

**Always pull for a Capacitor + Android APK + Razorpay project:**

| Skill | Why |
|---|---|
| capacitor-best-practices | Baseline config + plugin hygiene |
| capacitor-plugins | Plugin decision tree (official vs Capgo vs community) |
| capacitor-security | `capsec scan`, OWASP mobile, cleartext/ATS |
| capacitor-performance | Bundle size, WebView memory, 60fps |
| capacitor-accessibility | WCAG + touch targets |
| capacitor-deep-linking | assetlinks.json, universal links |
| capacitor-splash-screen | JS-controlled hide, launch UX |
| capacitor-keyboard | Resize mode + safe-area insets |
| safe-area-handling | Notch / Dynamic Island / gesture nav |
| debugging-capacitor | logcat, Safari inspector, WebView debug flags |
| ios-android-logs | Native log capture scripts |
| capacitor-ci-cd | **Reference for GitHub Actions APK/AAB pipeline** |
| capacitor-app-store | Store submission (Android + iOS) |
| capacitor-testing | Unit + device smoke tests |
| capacitor-push-notifications | FCM / APNs wiring |
| framework-to-capacitor | React/Vite specific migration guidance |
| webapp-to-capacitor | Store-approval anti-thin-wrapper rules |
| ionic-design | Mobile-native UI patterns |
| razorpay-payments | Order → checkout → verify → webhook flow |

**Skip unless explicitly requested:**

- `capgo-*` — Capgo hosted OTA (user's Naveen Bharat project removed CapacitorUpdater intentionally; Play Store updates only).
- `capacitor-app-upgrade-v*-to-v*` — only when doing a major-version bump.
- `ionic-appflow-migration`, `ionic-enterprise-sdk-migration`, `cordova-to-capacitor`, `capawesome-live-update-migration` — legacy migrations.
- `konsta-ui`, `tailwind-capacitor` — pull only if that UI kit is in use.
- `sqlite-to-fast-sql` — pull only if native SQL is on the roadmap.

## Reuse across future Lovable projects

Because `.agents/skills/` is committed to the connected GitHub repo:

1. In the new Lovable project, connect GitHub (Plus menu → GitHub → Connect project) and point it at a repo that contains a `.agents/skills/` directory (or copy the folder in via `cross_project--copy_project_asset`).
2. Run `skills--apply_draft` for each `.agents/skills/<name>` you want active in the new workspace.
3. Optionally add a project-knowledge line: "Skills sourced from `MrAnujBabu/35`; upstream `Cap-go/capgo-skills`."

Never symlink or git-submodule Cap-go/capgo-skills into a project — the retrieval index only picks up plain files under `.agents/skills/`.

## Top-class APK build pipeline (GitHub Actions)

This project already ships `.github/workflows/build-apk.yml` — treat it as the reference implementation. Copy it verbatim into any new Capacitor project, then adjust `appId`, `versionName` source, and the smoke-check plugin list.

**Non-negotiables** (mirrors `capacitor-bun-apk-build` skill):

- Node 24, JDK 21 Temurin, Android SDK 35, Gradle 8.11.1, AGP-compatible build-tools.
- `bun install --no-save` OR `npm install --legacy-peer-deps --no-audit --no-fund`.
- `npx tsgo --noEmit -p tsconfig.app.json` (never `tsc`).
- `npm run build` → `npx cap sync android` → `./gradlew assembleDebug --no-daemon --parallel --build-cache`.
- APK smoke check verifies `MainActivity` + every declared `@capacitor/*` plugin class is present in `capacitor.plugins.json`.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` at workflow env — silences node-20 deprecation without pinning pre-release actions.
- Never enable `minifyEnabled` for debug builds — R8 strips Capacitor plugin classes.
- `capacitor.config.ts` must ship with `server.url` **empty** — APK stays self-contained.
- `webContentsDebuggingEnabled` gated on `CAP_DEBUG=1`; production APK ships OFF.

For release-signed AAB: fork the workflow to `assembleRelease` + `bundleRelease`, load keystore via GitHub encrypted secrets (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) — never commit the keystore.

## Razorpay security bar (must pass before APK ships)

Reuse `.agents/skills/razorpay-payments`. Enforced rules:

1. Platform split: `Capacitor.isNativePlatform()` → `razorpayNative.ts`, else `razorpay.ts`. Loading the web SDK on native breaks UPI intents (PhonePe/GPay/Paytm).
2. **Order creation is server-only** — always via `create-razorpay-order` edge function. Never fabricate `order_id` client-side. `key_id` comes back from the function; never hardcode a `VITE_RAZORPAY_KEY_ID`.
3. **Signature verification is server-only** — `verify-razorpay-payment` computes `HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)`. Client handler payload is untrusted until verify returns 200.
4. **Webhook is the truth** — `razorpay-webhook` enrolls even if the client callback dies. Idempotent on `razorpay_payment_id`. Insert into `webhook_events` before side-effects.
5. Amounts in **paise** — integer for web SDK, **string** for the native plugin (plugin quirk).
6. Enrollments go through the `complete_paid_enrollment(...)` SECURITY DEFINER RPC — never `INSERT INTO enrollments` from the client for paid courses.
7. Refunds: `initiate-refund` → `razorpay-refund-webhook` → `process_refund(...)` RPC. Same idempotency + audit log rules.
8. Secrets configured server-side only: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Never in `localStorage`, never in the APK bundle, never in `capacitor.config.ts`.

## APK security preflight (run before every release build)

```bash
# 1. Dependency vulnerabilities
npx capsec scan --ci --severity high

# 2. Bundle secret sweep (no hardcoded keys/tokens)
rg -n "sk_live|pk_live|rzp_live|SUPABASE_SERVICE_ROLE|BEGIN (RSA|EC) PRIVATE" src/ public/ android/ ios/ || echo "clean"

# 3. Capacitor config drift
node -e "const c=require('./capacitor.config.ts');console.log(JSON.stringify(c,null,2))" | grep -E "cleartext|allowMixedContent|url" && echo "REVIEW REQUIRED"

# 4. TypeScript
npx tsgo --noEmit -p tsconfig.app.json

# 5. Tests
bunx vitest run

# 6. Supabase RLS regression
supabase functions invoke security-regression
```

All six must pass before pushing a `v*` tag that triggers the release workflow.

## Deliverable when the user says "import skills + build APK"

1. Clone Cap-go/capgo-skills to `/tmp`.
2. Copy the curation-matrix skills that are missing from `.agents/skills/`.
3. Apply each with `skills--apply_draft`.
4. Verify `.github/workflows/build-apk.yml` is present + healthy (see `capacitor-bun-apk-build`).
5. Run the 6-step APK security preflight.
6. Tell the user: to actually build the APK, push a `v<semver>` tag or trigger `workflow_dispatch` on the `build-apk.yml` workflow — GitHub Actions produces the signed artifact.

Lovable cannot push git tags itself; the APK build is triggered by the user in GitHub.
