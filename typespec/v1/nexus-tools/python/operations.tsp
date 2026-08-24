/**
 * nexus-tools (Python) — TypeSpec Operations
 *
 * Reverse-engineered from nexus/tools. These are CLI entrypoints, not an HTTP
 * surface. Each op documents the tool's contract: arguments, exit-code
 * semantics (0 = pass, 1 = violations found), and JSON output shape.
 */
import "./models.tsp";

namespace org.nexus.tools {

  // ─── CIR-1 suite (cir1/) ─────────────────────────────────────────────────

  /** Scan repo for CIR-relevant patterns; write a line-numbered index. */
  op cirScan(rootDir: string, outputFile: string): ScanHit[];

  /** Lint CIR-1..CIR-5 (flags: --cir2, --all, --strict, --json). */
  op cirLint(
    rules?: CirRule[],
    strict?: boolean,
    rootDir?: string,
  ): CirLintReport;

  /** Deterministic patch engine (--apply writes; default dry-run). */
  op cirPatch(apply: boolean, rootDir?: string): PatchAction[];

  // ─── CIR v2 ARL (arl_linter.py + arl/) ───────────────────────────────────

  /** 5-pass ARL: classification, authority (I7), lattice (I8), I1-I3, B2. */
  op arlLint(rootDir: string, json?: boolean): ArlReport;

  /** Map a path to its CIR-SDM domain label (classification.py). */
  op classifyPath(path: string): DomainLabel | null;

  // ─── Authority matrix (authority/) ───────────────────────────────────────

  /** Validate single-canonical-authority matrix (--json). */
  op checkAuthority(json?: boolean): AuthorityReport;

  /** Validate capability/workflow registries vs node-types.json (--json). */
  op checkGraph(json?: boolean): GateReport;

  /** Resolve + validate nexus.local JSON-LD contexts/vocabulary (--json/--map). */
  op checkJsonld(json?: boolean, map?: boolean): GateReport;

  /** Adapt projection manifest to ProjectionIR entries (--validate). */
  op projectionIr(validate: boolean, json?: boolean): ProjectionIRStream;

  // ─── api-docs (api-docs/) ────────────────────────────────────────────────

  /** Extract resolved REST endpoint inventories from every *-srv. */
  op extractRoutes(rootDir: string): ApiInventory[];

  /** Check committed *-srv openapi.yaml docs against extracted routes. */
  op checkApiDocsDrift(json?: boolean, quiet?: boolean): Record<ApiDocsDriftEntry>;

  // ─── Contract audit (contract_audit.py) ──────────────────────────────────

  /**
   * Umbrella gate runner: arl, cir1, authority, projection-ir, graph,
   * jsonld, apidocs. Emits one machine-readable report categorized into
   * unresolved / duplicate / stale / unauthorized.
   */
  op contractAudit(json?: boolean, skip?: AuditGate[]): ContractAuditReport;
}
