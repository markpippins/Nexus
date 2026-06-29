/**
 * Nexus PEB Kernel Models
 *
 * Domain entities, value objects, and enums for the Persistent Engineering Brain.
 * Each entity maps to a JPA @Entity in org.nexus.peb.domain.entity.
 * Enums map to JPA @Enumerated(STRING) in org.nexus.peb.domain.enums.
 */
namespace org.nexus.peb {

  // ========================================================================
  // Enums
  // ========================================================================

  /** Admission path classification for transaction routing */
  enum AdmissionPath {
    VALIDATE,
    MUTATE,
    REPORT_VIOLATION,
    UNKNOWN,
  }

  /** Result of an admission check */
  enum AdmissionResult {
    ALLOWED,
    REJECTED,
    ROUTED,
  }

  /** Lifecycle status of a recorded decision */
  enum DecisionStatus {
    DRAFT,
    ACCEPTED,
    SUPERSEDED,
    REJECTED,
  }

  /** Classification of a decision's effect on the state space */
  enum EntropyClass {
    COLLAPSER,
    SHAPER,
    NEUTRAL,
  }

  /** Severity level of a governance violation */
  enum ViolationSeverity {
    HARD,
    SOFT,
  }

  /** Categorization of governance violations */
  enum ViolationType {
    AUTHORITY_LEAKAGE,
    STATE_DEPENDENCY,
    SEMANTIC_NORMALIZATION,
    RCL,
    TRANSFORM_INVALID,
  }

  /** Resolution outcome for a recorded violation */
  enum ViolationResolution {
    REJECTED,
    ROUTED,
    CLARIFIED,
  }

  // ========================================================================
  // Value Objects
  // ========================================================================

  /** Capability token — must start with "cap:" prefix */
  model CapabilityToken {
    value: string;
  }

  /** SHA-256 hash value (64-char lowercase hex) used for state integrity */
  model PebStateHash {
    value: string;
  }

  // ========================================================================
  // DTOs
  // ========================================================================

  /** Response from the admission controller */
  model AdmissionResponse {
    /** Human-readable outcome message */
    message: string;
    /** Whether the request was admitted (true) or denied (false) */
    admitted: boolean;
  }

  // ========================================================================
  // PebTransaction — maps to JPA entity (table: peb.transactions)
  // Core audit record for every PEB operation
  // ========================================================================

  model PebTransaction {
    /** Auto-generated UUID primary key */
    @format("uuid")
    id: string;

    /** Caller-provided idempotency key for safe retry */
    @maxLength(128)
    idempotencyKey: string;

    /** Who initiated this transaction (agent, service, or human ID) */
    @maxLength(128)
    entityId: string;

    /** Admission result determined by governance engine */
    admissionResult: AdmissionResult;

    /** MCP facade tool name (e.g. "peb_validate_transition") */
    @maxLength(64)
    toolName: string;

    /** Arbitrary JSON — full request payload */
    input: unknown;

    /** Arbitrary JSON — full response payload */
    output?: unknown;

    /** State hash at transaction begin */
    @maxLength(64)
    beforeHash?: string;

    /** State hash after transaction commit */
    @maxLength(64)
    afterHash?: string;

    /** Arbitrary JSON — changed keys with new checksums */
    stateDelta?: unknown;

    /** Timestamp when the transaction was created */
    createdAt: utcDateTime;

    /** Timestamp when the transaction was committed (null if rolled back) */
    committedAt?: utcDateTime;
  }

  // ========================================================================
  // PebViolation — maps to JPA entity (table: peb.violations)
  // Records of governance violations detected during transaction processing
  // ========================================================================

  model PebViolation {
    /** Auto-generated UUID primary key */
    @format("uuid")
    id: string;

    /** FK to the transaction that triggered this violation */
    @format("uuid")
    transactionId?: string;

    /** Type of violation */
    violationType: ViolationType;

    /** Severity of the violation */
    severity: ViolationSeverity;

    /** Entity that caused the violation */
    @maxLength(128)
    entityId?: string;

    /** Capability that was attempted when the violation occurred */
    @maxLength(128)
    capabilityAttempted?: string;

    /** Arbitrary JSON — full request context at violation time */
    context?: unknown;

    /** How the violation was resolved */
    resolution?: ViolationResolution;

    /** Timestamp when the violation was recorded */
    createdAt: utcDateTime;
  }

  // ========================================================================
  // PebDecision — maps to JPA entity (table: peb.decisions)
  // Architecture Decision Records with Merkle-chain integrity
  // ========================================================================

  model PebDecision {
    /** Auto-generated UUID primary key */
    @format("uuid")
    id: string;

    /** FK to the transaction that produced this decision */
    @format("uuid")
    transactionId?: string;

    /** ADR identifier (e.g. "ADR-007") */
    @maxLength(32)
    adrNumber?: string;

    /** Decision title */
    @maxLength(256)
    title: string;

    /** Current status of this decision */
    status: DecisionStatus;

    /** Arbitrary JSON — structured rationale and context */
    summary?: unknown;

    /** State keys affected by this decision */
    affectedKeys?: string[];

    /** Entropy classification */
    entropyClass?: EntropyClass;

    /** State hash at transaction start */
    @maxLength(64)
    beforeHash?: string;

    /** State hash after decision commit */
    @maxLength(64)
    afterHash?: string;

    /** Author identifier */
    @maxLength(128)
    authorId: string;

    /** Merkle link to parent decision (for chain integrity) */
    @format("uuid")
    parentDecisionId?: string;

    /** If set, this decision rolls back the referenced decision */
    @format("uuid")
    rollbackOf?: string;

    /** Timestamp when the decision was recorded */
    createdAt: utcDateTime;
  }

  // ========================================================================
  // PebState — maps to JPA entity (table: peb.state)
  // Key-value state store with content-addressable checksums
  // ========================================================================

  model PebState {
    /** Auto-generated UUID primary key */
    @format("uuid")
    id: string;

    /** Unique state key (e.g. "invariants", "architecture", "trajectory") */
    @maxLength(64)
    key: string;

    /** Arbitrary JSON — the actual state content */
    content: unknown;

    /** Arbitrary JSON — metadata (version, author, timestamps) */
    metadata?: unknown;

    /** SHA-256 checksum of content for integrity verification */
    @maxLength(64)
    checksum: string;

    /** Optimistic lock version counter */
    version: int64;

    /** Timestamp when the state was created */
    createdAt: utcDateTime;

    /** Timestamp when the state was last updated */
    updatedAt: utcDateTime;
  }

  // ========================================================================
  // PebTrace — maps to JPA entity (table: peb.traces)
  // Observational trace segments forming a DAG of cognitive processing
  // ========================================================================

  model PebTrace {
    /** Auto-generated UUID primary key */
    @format("uuid")
    id: string;

    /** FK to the associated transaction */
    @format("uuid")
    transactionId: string;

    /** Associated work request identifier */
    @maxLength(128)
    workRequestId: string;

    /** Parent trace node (for DAG structure) */
    @format("uuid")
    parentTraceId?: string;

    /** Stage name — cognitive role or skill that produced this trace */
    @maxLength(64)
    stage: string;

    /** Arbitrary JSON — state summary at entry */
    inputs?: unknown;

    /** Arbitrary JSON — why the transformation occurred */
    causalEntries?: unknown;

    /** Arbitrary JSON — alternative branch points considered */
    rejectedAlternatives?: unknown;

    /** Confidence score 0.0–1.0 */
    confidence: float32;

    /** Status — always "observational" */
    @maxLength(16)
    status: string;

    /** Timestamp when the trace was recorded */
    createdAt: utcDateTime;
  }

  // ========================================================================
  // PebCapability — maps to JPA entity (table: peb.capabilities)
  // Capability-based access control for agents and services
  // ========================================================================

  model PebCapability {
    /** Auto-generated UUID primary key */
    @format("uuid")
    id: string;

    /** Entity identifier (agent, service, human) */
    @maxLength(128)
    entityId: string;

    /** Capability string (e.g. "cap:emit_work_request") */
    @maxLength(128)
    capability: string;

    /** Who granted this capability */
    @maxLength(128)
    grantedBy?: string;

    /** Optional expiration timestamp */
    expiresAt?: utcDateTime;

    /** Timestamp when the capability was recorded */
    createdAt: utcDateTime;

    /** Whether this capability is currently active */
    active: boolean;
  }

  // ========================================================================
  // Request Models (client-provided, subset of full entity)
  // ========================================================================

  /** Request payload for the PEB MCP facade endpoint */
  model PebTransactionRequest {
    /** Caller-provided idempotency key for safe retry */
    idempotencyKey: string;

    /** Entity identifier initiating this request */
    entityId: string;

    /** MCP facade tool name to dispatch */
    @maxLength(64)
    toolName: string;

    /** Arbitrary JSON payload for the tool */
    input: unknown;
  }
}
