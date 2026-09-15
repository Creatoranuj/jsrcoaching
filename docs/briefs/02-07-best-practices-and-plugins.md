# Group A — Best Practices (#2) + Plugins (#7)

## Goal
Establish a single, typed boundary between feature code and Capacitor plugins.

## What landed
1. **`src/lib/bridge/index.ts`** — `isNative()`, `getPlatform()`,
   `isPluginAvailable()`, `BridgeError`, `BridgeErrorCode`, `safeCall()`.
2. **`src/lib/bridge/env.ts`** — typed `env` object; every `import.meta.env.*`
   read should flow through here.
3. **`src/vite-env.d.ts`** — strongly typed `ImportMetaEnv`.
4. **ESLint guardrail** — `no-restricted-imports` blocks `@capacitor/*` outside
   `src/lib/bridge/**` and `src/lib/native/**`.
5. **Docs**: this brief.

## Rules of the road
- Feature code **must not** `import … from "@capacitor/..."` directly.
  Use `@/lib/bridge` or add a thin wrapper in `@/lib/native/<plugin>.ts`.
- Every native call goes through `safeCall(plugin, method, fn, { fallback })`.
- Read env via `import { env } from "@/lib/bridge"` — not `import.meta.env`.

## Migration (incremental)
Existing direct imports continue to work. The ESLint rule is **warn**, not
error, so the build stays green while we migrate file-by-file as we touch them
in later groups (B–F).

## Validation
- `tsc` passes (typed env, BridgeError generics).
- `safeCall` returns `fallback` on web → callers no longer need `if (isNative)`.
- BridgeError carries `.code` for `CANCELLED` / `PERMISSION` / `UNAVAILABLE`
  branching.
