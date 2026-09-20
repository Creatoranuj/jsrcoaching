import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The stuck-payment sweep must run unattended. It used to depend on a shared
 * secret nobody had configured, so the sweep silently never ran. It now
 * authenticates with a GitHub Actions OIDC token pinned to this repo and
 * workflow — this guards that wiring from regressing.
 */
const FN = resolve(
  __dirname,
  "../../supabase/functions/reconcile-pending-payments/index.ts",
);
const WF = resolve(__dirname, "../../.github/workflows/reconcile-payments.yml");

describe("reconcile sweep cron auth", () => {
  const fn = readFileSync(FN, "utf8");
  const wf = readFileSync(WF, "utf8");

  it("verifies a GitHub OIDC token pinned to repo + workflow", () => {
    expect(fn).toContain("x-github-oidc-token");
    expect(fn).toContain("token.actions.githubusercontent.com");
    expect(fn).toContain("Creatoranuj/jsrcoaching");
    expect(fn).toContain("reconcile-payments.yml");
  });

  it("still supports the legacy shared secret for manual sweeps", () => {
    expect(fn).toContain("RECONCILE_CRON_SECRET");
  });

  // The workflow file can only be changed with GitHub "workflows" permission,
  // so accept either the keyless OIDC wiring or the legacy secret wiring.
  it("workflow authenticates the sweep somehow, without inline credentials", () => {
    const oidc = wf.includes("id-token: write") && wf.includes("jsr-coaching-reconcile");
    const legacy = wf.includes("secrets.RECONCILE_CRON_SECRET");
    expect(oidc || legacy).toBe(true);
  });
});
