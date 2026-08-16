/**
 * wr-compile CP-2B/CP-5 (D2/D5, R-A-2026-08-15-010) — compile verdict id.
 *
 * Locks the deterministic-identity half of the WR compile verdict store: the
 * verdict_id is SHA256(verdict_type, entity_key, rule_version, description),
 * so re-issuing the same verdict yields the same id (idempotent insert via
 * ON CONFLICT) and every tuple component participates in the identity.
 *
 * Pure and DB-free. The store/DB behaviours (idempotent insert, newest-wins
 * gate, re-parenting, immutability guard) live in db.schema.test.ts alongside
 * the other fresh-schema integration checks.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/compile-verdict.test.ts
 */
import { describe, test, expect } from "vitest";

import { computeCompileVerdictId } from "./db";

describe("CP-2B/CP-5 (D2/D5) compile verdict id", () => {
  test("AC1 — computeCompileVerdictId is deterministic", () => {
    const a = computeCompileVerdictId("WR_COMPILE_PASS", "ek", "1", "ok");
    const b = computeCompileVerdictId("WR_COMPILE_PASS", "ek", "1", "ok");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("AC1 — every tuple component participates in the id", () => {
    const base = computeCompileVerdictId("WR_COMPILE_PASS", "ek", "1", "ok");
    expect(computeCompileVerdictId("WR_COMPILE_FAIL", "ek", "1", "ok")).not.toBe(base);
    expect(computeCompileVerdictId("WR_COMPILE_PASS", "ek2", "1", "ok")).not.toBe(base);
    expect(computeCompileVerdictId("WR_COMPILE_PASS", "ek", "2", "ok")).not.toBe(base);
    expect(computeCompileVerdictId("WR_COMPILE_PASS", "ek", "1", "ok2")).not.toBe(base);
  });
});
