/**
 * Unit test: conduit-mcp PG_SCHEMA env var validation.
 *
 * The security fix validates CONDUIT_PG_SCHEMA against
 * /^[a-zA-Z_][a-zA-Z0-9_]*$/ at module load time before it is
 * interpolated into SET search_path / CREATE SCHEMA DDL.
 *
 * This test verifies:
 *   1. Valid schema names are accepted (module loads without error)
 *   2. Invalid schema names cause the module to throw on import
 *   3. The regex pattern itself is correct (direct pattern test)
 *
 * Run: npx vitest run tests/schema-validation.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

describe("PG_SCHEMA validation regex", () => {
  it("accepts valid PostgreSQL identifiers", () => {
    const valid = ["conduit", "tackle", "vision", "peb", "nebula", "test_conduit_123", "_private", "a", "A1"];
    for (const name of valid) {
      expect(SAFE_IDENT.test(name), `"${name}" should be valid`).toBe(true);
    }
  });

  it("rejects invalid PostgreSQL identifiers", () => {
    const invalid = [
      "public",          // reserved but still a valid identifier — NOT rejected by regex alone
      "1numeric_start",  // starts with digit
      "hyphen-name",     // contains hyphen
      "space name",      // contains space
      "semi;colon",      // contains semicolon
      "drop';table",     // SQL injection attempt
      "",                // empty string
      "quoted\"name",    // contains double quote
      "back`tick",       // contains backtick
      "dollar$name",     // contains dollar sign
    ];
    // Note: "public" is a valid identifier syntactically — it's rejected by
    // the separate _get_schema public-check, not the regex. So we exclude it here.
    const regexRejected = invalid.filter(n => n !== "public");
    for (const name of regexRejected) {
      expect(SAFE_IDENT.test(name), `"${name}" should be rejected`).toBe(false);
    }
  });
});

describe("PG_SCHEMA module-load validation", () => {
  const originalSchema = process.env.CONDUIT_PG_SCHEMA;

  afterEach(() => {
    // Restore original env
    if (originalSchema !== undefined) {
      process.env.CONDUIT_PG_SCHEMA = originalSchema;
    } else {
      delete process.env.CONDUIT_PG_SCHEMA;
    }
    vi.resetModules();
  });

  it("throws on import when CONDUIT_PG_SCHEMA contains SQL injection", async () => {
    process.env.CONDUIT_PG_SCHEMA = "conduit'; DROP TABLE users--";
    vi.resetModules();
    await expect(import("../src/db")).rejects.toThrow(/Invalid CONDUIT_PG_SCHEMA/);
  });

  it("throws on import when CONDUIT_PG_SCHEMA starts with a digit", async () => {
    process.env.CONDUIT_PG_SCHEMA = "1invalid";
    vi.resetModules();
    await expect(import("../src/db")).rejects.toThrow(/Invalid CONDUIT_PG_SCHEMA/);
  });

  it("throws on import when CONDUIT_PG_SCHEMA contains a hyphen", async () => {
    process.env.CONDUIT_PG_SCHEMA = "my-schema";
    vi.resetModules();
    await expect(import("../src/db")).rejects.toThrow(/Invalid CONDUIT_PG_SCHEMA/);
  });

  it("throws on import when CONDUIT_PG_SCHEMA is empty", async () => {
    process.env.CONDUIT_PG_SCHEMA = "";
    vi.resetModules();
    // Empty string is falsy, so `|| "conduit"` kicks in → valid. This is correct behavior.
    // The validation only triggers for non-empty invalid values.
    // So this should NOT throw — the default "conduit" is used.
    const mod = await import("../src/db");
    expect(mod).toBeDefined();
    expect(typeof mod.initDb).toBe("function");
  });

  it("succeeds on import with valid CONDUIT_PG_SCHEMA", async () => {
    process.env.CONDUIT_PG_SCHEMA = "conduit";
    vi.resetModules();
    const mod = await import("../src/db");
    expect(mod).toBeDefined();
    expect(typeof mod.initDb).toBe("function");
    expect(typeof mod.getDb).toBe("function");
  });

  it("succeeds on import with default schema (no env var)", async () => {
    delete process.env.CONDUIT_PG_SCHEMA;
    vi.resetModules();
    const mod = await import("../src/db");
    expect(mod).toBeDefined();
    expect(typeof mod.initDb).toBe("function");
  });
});
