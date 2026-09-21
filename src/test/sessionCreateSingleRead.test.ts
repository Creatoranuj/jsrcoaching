import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regression guard (PERF 2026-09-21): creating a login session must read the
// user_sessions table ONCE. It used to run two selects (list + same-device
// lookup), which was the project's #1 slow query.
const SRC = readFileSync(
  join(process.cwd(), "supa" + "base", "func" + "tions", "manage-session", "index.ts"),
  "utf8",
);

describe("manage-session create path", () => {
  it("reads user_sessions only once per login", () => {
    const create = SRC.slice(SRC.indexOf('action === "create"'), SRC.indexOf('action === "heartbeat"'));
    const reads = create.match(/\.select\(/g) ?? [];
    expect(reads.length).toBeLessThanOrEqual(2); // 1 list read + 1 insert...select()
  });

  it("matches the same device in memory, not with an extra query", () => {
    expect(SRC).toContain('.select("id, session_token, logged_in_at, device_type, user_agent")');
    expect(SRC).not.toContain('.eq("device_type"');
  });
});
