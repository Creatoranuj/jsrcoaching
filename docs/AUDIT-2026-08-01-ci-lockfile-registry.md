# Audit: CI lockfile / registry pinning (`bun.lock`, `package-lock.json`, APK workflow)

Date: 2026-08-01 · Scope: build/CI only — no app runtime code touched.
Skills: `capacitor-ci-cd`, `capacitor-bun-apk-build`, `senior-architect-audit`.

**Rating: 4.5/5** — the root cause (sandbox-private registry URLs baked into both
lockfiles) is eliminated and now guarded at two CI gates; remaining gap is that
lockfile regeneration is still a manual human step with no scheduled drift check.

## Root cause

`bun install` on the GitHub runner failed three times with `ConnectionRefused` /
`FailedToOpenSocket` on the *same* packages every attempt (`tar`, `chownr`,
`minizlib`, `yallist`). That is not registry flakiness — it is a lockfile that
pins **absolute** tarball URLs on hosts only reachable inside a sandbox:

| Host | Written by |
| --- | --- |
| `https://europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/...` | installs run in the Lovable sandbox |
| `http://package-firewall.replit.local/npm/...` | installs run in Replit |

The npm fallback then failed with `EAI_AGAIN` for exactly the same reason —
`package-lock.json` carried 184 of those URLs (112 Replit + 72 pkg.dev). So the
"fallback" never had a chance: both lockfiles were poisoned from the same source.

Counts before the fix: `bun.lock` 528 private URLs, `package-lock.json` 184.
Counts after: **0 and 0** (`package-lock.json` regenerated clean from an empty
tree — 1037 packages, 1036 `resolved` on `registry.npmjs.org`, 0 missing
`integrity`).

## Findings

### [HIGH] [CONFIG] Both lockfiles pinned to unreachable private registries
**Where:** `bun.lock`, `package-lock.json`
**Why it matters:** every tagged release build burned ~4 minutes on retries and
then either failed outright or silently switched package manager, so the shipped
APK's dependency tree was not the one the lockfile described.
**Fix (applied):** regenerated both against `https://registry.npmjs.org`.

### [HIGH] [CONFIG] `package-lock.json` regenerated with no `integrity` hashes
**Where:** `package-lock.json` (intermediate state during this fix)
**Why it matters:** `npm install --package-lock-only` run against an existing
bun-populated `node_modules` produced 944 entries with neither `resolved` nor
`integrity` — a lockfile that pins versions but cannot verify tarball contents,
i.e. no supply-chain protection at all.
**Fix (applied):** regenerated in a clean temp tree (`/tmp/plgen`) with only
`package.json` + `.npmrc` present, so npm fetched real metadata. Verified
`missing integrity = 0`.

### [MEDIUM] [RELY] Guard only covered `bun.lock` and only one host pattern
**Where:** `.github/workflows/build-apk.yml:218` (old inline `grep`)
**Why it matters:** it matched `*.pkg.dev` only, missed `replit.local`, missed
`package-lock.json` entirely, and — being inside the install step — was skipped
whenever the `node_modules` cache hit.
**Fix (applied):** `scripts/check-lockfile-registry.mjs` covers both hosts, all
three lockfile names, and also rejects a committed binary `bun.lockb` (which the
dependency scanner cannot read). Wired as `bun run check:lockfile`, invoked from
the APK workflow install step **and** as a standalone gate in `code-guards.yml`
that triggers on any lockfile/`package.json` change — so a poisoned lockfile is
caught at PR time, not at release-tag time.

### [MEDIUM] [CONFIG] npm fallback could re-inherit a proxy host
**Where:** `.github/workflows/build-apk.yml` npm fallback
**Fix (applied):** explicit `--registry=https://registry.npmjs.org` on the
fallback plus `NPM_CONFIG_REGISTRY` / `BUN_CONFIG_REGISTRY` at step env.

### [LOW] [CONFIG] Sandboxes will re-poison lockfiles on the next install
**Fix (applied):** `.npmrc` (`registry=https://registry.npmjs.org/`) and
`bunfig.toml` (`[install] registry`) pin the public registry, so an install run
inside Replit or Lovable now writes public URLs by default.

## Wins (kept, not touched)

- retry + exponential backoff on `bun install` — still correct for *genuine*
  transient socket errors; the guard now separates the two failure classes.
- `node_modules` cache keyed on the lockfile hash.
- `--frozen-lockfile`, `--ignore-scripts`, `--network-concurrency 8`.
- artifact-quota cleanup step and the tag ↔ `versionName` numeric guard.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` (do not remove — see the APK build skill).

## Verification

| Check | Result |
| --- | --- |
| `node scripts/check-lockfile-registry.mjs` | ✅ pass |
| `grep -cE 'replit\.local\|pkg\.dev' package-lock.json` | `0` |
| `bun install --frozen-lockfile` | ✅ 936 installs / 1027 packages, no changes |
| `bun run typecheck` | ✅ clean |
| `bun run build` | ✅ entry 117.9 KB (budget 180 KB) |

## Fix plan / follow-ups

1. Done — lockfiles regenerated, registry pinned, guard wired into two workflows.
2. Backlog — add a monthly scheduled `code-guards` run so lockfile drift is
   detected even in weeks with no dependency changes.
3. Backlog — `package.json` still carries a `tar: ^6.2.1` override while
   `@capacitor/cli` 7.6.5 wants `tar@^7.5.3`. Resolution currently succeeds, but
   revisit the override on the next Capacitor bump rather than leaving a pin
   whose original reason is undocumented.

## Open questions

- Is the `tar@^6.2.1` override still required, or a leftover from an old
  advisory? If the latter, dropping it removes a future resolution landmine.
