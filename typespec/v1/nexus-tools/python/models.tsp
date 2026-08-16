/**
 * nexus-tools (Python) — TypeSpec Models
 *
 * Reverse-engineered from nexus/tools — the code-integrity & governance
 * tooling: CIR-1..5 ontology lint, CIR v2 ARL (Anti-Recursion Linter),
 * authority-matrix validation, graph conformance, JSON-LD resolution,
 * ProjectionIR adaptation, api-docs drift, and the contract-audit umbrella.
 * No route or verb decorators live here.
 */
namespace org.nexus.tools {

  // ─── Shared violation & report shapes ────────────────────────────────────

  /** Severity of a governance violation. */
  enum Severity {
    CRITICAL,
    ERROR,
    WARNING,
    INFO,
  }

  /**
   * Union shape of a violation record. Different gates populate different
   * fields (see contract_audit.py collect()).
   */
  model Violation {
    /** Gate-specific failure class (authority/graph/jsonld). */
    failure_class?: string;
    /** ARL violation type (RECURSIVE_WRAPPER, ...). */
    violation_type?: string;
    /** CIR rule (CIR-1 .. CIR-5). */
    rule?: string;
    /** CIR violation code. */
    code?: string;
    /** Report-level domain / semantic class / node id. */
    domain?: string;
    /** File path or location of the violation. */
    path?: string;
    location?: string;
    detail?: string;
    description?: string;
    severity?: Severity;
  }

  /** Standard gate report envelope (status + violations + total). */
  model GateReport {
    status: "PASS" | "FAIL";
    total_violations: int32;
    violations: Violation[];
  }

  // ─── CIR-1 suite (cir1/) ─────────────────────────────────────────────────

  /** CIR ontology rules (lint.py). */
  enum CirRule {
    CIR_1,
    CIR_2,
    CIR_3,
    CIR_4,
    CIR_5,
  }

  /** Enforcement levels (lint.py). */
  enum EnforcementLevel {
    STRICT,
    STRICT_NATIVE,
    LIMITED,
    MINIMAL,
  }

  /** CIR classification categories (scan.py). */
  enum ScanCategory {
    PIPELINE_PHANTOM,
    DERIVATION_CONTRACT,
    ASPIRATIONAL_SCHEMA,
    RUNTIME_ASSUMPTION,
    UNIMPLEMENTED_REGISTRY,
    OTHER,
  }

  /** Line-numbered reference index entry produced by scan.py. */
  model ScanHit {
    category: ScanCategory;
    path: string;
    line: int32;
    pattern: string;
  }

  /** CIR lint result (--json). */
  model CirLintReport extends GateReport {
    rules_applied: CirRule[];
    enforcement: EnforcementLevel;
  }

  /**
   * Deterministic patch action (patch.py). CIR-1 removes intent_source and
   * downgrades mode to "legacy"; CIR-2..5 wrap values in quarantine markers.
   */
  model PatchAction {
    path: string;
    kind: "remove" | "downgrade" | "quarantine";
    rule: CirRule;
    applied: boolean;
    diff?: string;
  }

  // ─── CIR v2 ARL (arl_linter.py + arl/) ───────────────────────────────────

  /** CIR-SDM domain labels (classification.py). */
  enum DomainLabel {
    SCHEMA,
    CONFIG,
    LEDGER,
    STATE_MACHINE,
    CODE,
    METADATA,
    DATA,
    BUILD,
  }

  /** ARL invariant/authority/lattice/graph violation types. */
  enum ArlViolationType {
    RECURSIVE_WRAPPER,
    NESTED_QUARANTINE,
    STATE_IN_SCHEMA,
    STATE_INFERENCE,
    CROSS_LAYER_LEAK,
    AUTHORITY_DRIFT,
    LATTICE_VIOLATION,
    GOVERNANCE_CYCLE,
    FORBIDDEN_GOVERNANCE_EDGE,
  }

  /** Sanctioned quarantine envelope written by patch.py. */
  model QuarantineEnvelope {
    status: string;
    reason: string;
    original: Record<unknown>;
  }

  /** Governance dependency graph summary (graph.py). */
  model GovernanceGraph {
    nodes: int32;
    edges: int32;
    cycles?: int32;
    forbidden_edges?: int32;
  }

  /** ARL report (--json output schema). */
  model ArlReport extends GateReport {
    graph: GovernanceGraph;
  }

  /** Layer definitions for cross-layer leak checks (invariants.py). */
  model LayerDefinition {
    domain: DomainLabel;
    keywords: string[];
    forbidden: string[];
  }

  // ─── Authority matrix (authority/check_authority.py) ─────────────────────

  /** One authority-matrix entry. */
  model AuthorityEntry {
    domain: string;
    canonical: string;
    superseded?: string[];
    projections?: string[];
  }

  /** The authority matrix document (schemas/validation/authority/). */
  model AuthorityMatrix {
    authorities: AuthorityEntry[];
    semantic_class_keys: Record<string[]>;
  }

  /** Authority validator failure classes. */
  enum AuthorityFailureClass {
    no_authority,
    duplicate_class,
    unlisted_projection,
    projection_drift,
  }

  /** Authority report. */
  model AuthorityReport extends GateReport {
    matrix: string;
  }

  /** CIR-SDM (domain, subtype) classification of a path. */
  model PathClassification {
    domain: DomainLabel;
    subtype?: "CANONICAL" | "ASPIRATIONAL" | "STATEFUL";
    mode?: "AUTHORITATIVE" | "STRUCTURAL" | "DERIVATIONAL" | "STATEFUL";
  }

  // ─── Graph conformance (authority/check_graph.py) ────────────────────────

  /** Capability node types (graph/schema/node-types.json). */
  enum NodeType {
    inference,
    deterministic,
    external_tool,
  }

  /** Capability node. */
  model CapabilityNode {
    id: string;
    `type`: NodeType;
    input_schema: Record<unknown>;
    output_schema: Record<unknown>;
    implementation?: string;
    `interface`?: ExternalToolInterface;
  }

  /** External-tool interface descriptor. */
  model ExternalToolInterface {
    protocol: string;
  }

  /** Workflow DAG. */
  model Workflow {
    id: string;
    nodes: CapabilityNode[];
    edges: WorkflowEdge[];
    entry_point?: string;
    output_node?: string;
  }

  /** Directed edge of a workflow. */
  model WorkflowEdge {
    source: string;
    target: string;
  }

  /** Graph conformance failure classes. */
  enum GraphFailureClass {
    invalid_node,
    dangling_ref,
    duplicate_id,
    graph_cycle,
  }

  // ─── JSON-LD resolver (authority/check_jsonld.py) ────────────────────────

  /** JSON-LD validation failure classes. */
  enum JsonLdFailureClass {
    unresolved_context,
    unresolved_namespace,
    undeclared_term,
    unknown_prefix,
    unresolved_id,
  }

  /** One checked context mapping: URL -> resolved repo path. */
  model ContextMapEntry {
    url: string;
    path: string | null;
  }

  // ─── ProjectionIR (authority/projection_ir.py) ───────────────────────────

  /** Read-only, ephemeral IR entry adapted from the projection manifest. */
  model ProjectionIREntry {
    source_operator: string;
    domain: string;
    proposition: ProjectionProposition;
    confidence: float64;
    constraints: string[];
    trace: string[];
  }

  /** Proposition facet of a ProjectionIR entry. */
  model ProjectionProposition {
    outputPath: string | null;
    generator: string | null;
    lifecycle: string | null;
    active: boolean;
  }

  /** ProjectionIR stream output (--json). */
  model ProjectionIRStream {
    stream: ProjectionIREntry[];
    count: int32;
    valid: int32;
    failures: (string | null)[];
  }

  // ─── api-docs (api-docs/) ────────────────────────────────────────────────

  /** HTTP verb of an extracted endpoint. */
  enum HttpMethod {
    GET,
    POST,
    PUT,
    PATCH,
    DELETE,
    OPTIONS,
  }

  /** Resolved REST endpoint inventory entry. */
  model ApiEndpoint {
    method: HttpMethod;
    path: string;
    summary: string;
  }

  /** Per-service endpoint inventory. */
  model ApiInventory {
    service: string;
    endpoints: ApiEndpoint[];
  }

  /** Per-document drift check result (check_drift.py). */
  model ApiDocsDriftEntry {
    status: "ok" | "drift" | "missing";
    detail?: string;
  }

  // ─── Contract audit (contract_audit.py) ──────────────────────────────────

  /** Assessment edge categories of the contract audit. */
  enum AuditCategory {
    unresolved,
    duplicate,
    stale,
    unauthorized,
  }

  /** Gates run by the audit. */
  enum AuditGate {
    arl,
    cir1,
    authority,
    projection_ir,
    graph,
    jsonld,
    apidocs,
  }

  /** One gate result. */
  model GateResult {
    gate: AuditGate;
    passed: boolean;
    exit_code: int32;
    skipped: boolean;
  }

  /** Machine-readable contract-audit report. */
  model ContractAuditReport {
    status: "PASS" | "FAIL";
    categories: Record<AuditCategoryItems>;
    total_violations: int32;
    gates: GateResult[];
    failed_gates: string[];
  }

  /** Per-category violation bucket. */
  model AuditCategoryItems {
    count: int32;
    items: Violation[];
  }
}
