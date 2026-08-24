/**
 * sweep-scope.ts — CP-7 (D7): pinned sweep scope for recon determinism.
 *
 * D7 contract: a recon node's sweep scope is a canonical input of the plan
 * spec AND the compiled WR — directories, patterns, exclusions, and tool +
 * version. The planner authors it, the builder runs against it verbatim, and
 * it feeds the entityKey canonical input set (same scope → same inventory →
 * same identity).
 *
 * `canonicalScope` is the deterministic serialization used for that identity:
 * it sorts arrays and fixes key order, so two scopes with the same content
 * serialize identically regardless of declaration order. The entityKey
 * derivation input-set extension (D3) consumes this — the helper is the
 * stable, testable core of that contract.
 *
 * Pure and DB-free.
 */

export interface SweepScope {
  /** Directories swept (e.g. `typescript/*-srv`, `scripts/`, `nexus/bin`). */
  directories: string[];
  /** Patterns matched (e.g. ports/jdbc/`pguser`/`pgpass`/URLs). */
  patterns: string[];
  /** Explicit exclusions. */
  exclusions?: string[];
  /** Tool used (e.g. `grep`). */
  tool: string;
  /** Tool version (pinned for reproducibility). */
  toolVersion: string;
}

/**
 * Deterministic canonical serialization of a sweep scope.
 *
 * Arrays are sorted and keys are written in fixed order, so the same scope
 * content always serializes identically (order-insensitive). This is the
 * identity-stable input for D7: changing one scope element changes the output.
 */
export function canonicalScope(scope: SweepScope): string {
  return JSON.stringify({
    directories: [...scope.directories].sort(),
    patterns: [...scope.patterns].sort(),
    exclusions: [...(scope.exclusions ?? [])].sort(),
    tool: scope.tool,
    toolVersion: scope.toolVersion,
  });
}

/** The T25 0.1 baseline sweep scope (per D7). */
export const T25_0_1_SCOPE: SweepScope = {
  directories: ["typescript/*-srv", "scripts/", "nexus/bin"],
  patterns: ["ports", "jdbc", "pguser", "pgpass", "URLs"],
  tool: "grep",
  toolVersion: "3.11", // GNU grep (pin per environment)
};
