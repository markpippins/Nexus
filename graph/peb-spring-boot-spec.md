# PEB Spring Boot Starter — Implementation Spec

**Status:** Detailed design — ready for Implementation Plan derivation  
**Date:** 2026-06-15  
**Supersedes:** `graph/peb-mcp-spec.md` (architecture-level); this document is the *build spec*  
**Audience:** Engineers implementing Phase 1 of the PEB governance kernel

---

## 0. Relationship to PEB MCP Spec

This document derives from `graph/peb-mcp-spec.md` (v2, post-critique). The MCP
spec defines *what* the system does and *why*. This document defines *exactly
what to build* — module layout, class contracts, data schema, error hierarchy,
integration seams, test structure.

An engineer should be able to take this document and produce a working Phase 1
without referencing any other document for structural decisions. (The MCP spec
provides the context; this spec provides the blueprint.)

**Phase 1 scope** (only — no scope creep):
- PebGovernanceEngine kernel
- AdmissionController
- PebTransaction engine
- PebHashService (incremental Merkle)
- PostgreSQL schema (all 6 tables)
- MCP tool facades (thin REST controllers)
- Integration with losm-ir for transition validation
- No decision recording, no traces, no violations yet

---

## 1. Module Layout (Maven Multi-Module)

```
peb-kernel/
├── pom.xml                          # Parent POM — Spring Boot 3.4, Java 21
├── peb-domain/
│   ├── pom.xml
│   └── src/main/java/.../peb/domain/
│       ├── entity/                   # JPA entities
│       ├── vo/                       # Value objects (immutable)
│       ├── enums/                    # Enumerations
│       └── event/                    # Domain events
├── peb-store/
│   ├── pom.xml
│   └── src/main/java/.../peb/store/
│       ├── repository/               # Spring Data JPA repositories
│       ├── migration/                # Flyway SQL migrations
│       └── query/                    # Read-only query services
├── peb-core/
│   ├── pom.xml
│   └── src/main/java/.../peb/core/
│       ├── engine/                   # PebGovernanceEngine
│       ├── admission/                # AdmissionController
│       ├── transaction/              # PebTransactionEngine
│       ├── validation/               # InvariantValidator
│       └── spi/                      # Service Provider Interfaces (integration SPI)
├── peb-hash/
│   ├── pom.xml
│   └── src/main/java/.../peb/hash/
│       ├── service/                  # PebHashService
│       ├── merkle/                   # Merkle tree builder
│       └── support/                  # Digest utilities
├── peb-api/
│   ├── pom.xml
│   └── src/main/java/.../peb/api/
│       ├── controller/               # MCP REST facades
│       ├── dto/                      # Request/Response DTOs
│       └── mapper/                   # DTO ↔ domain mappers
├── peb-adapters/
│   ├── pom.xml
│   └── src/main/java/.../peb/adapters/
│       ├── losmir/                   # losm-ir transition adapter
│       ├── conduit/                  # Conduit MCP integration
│       └── nebula/                   # Nebula state adapter (phase 2+)
├── peb-observability/
│   ├── pom.xml
│   └── src/main/java/.../peb/observability/
│       ├── audit/                    # Transaction audit logger
│       ├── violation/                # Violation stream
│       └── trace/                    # Trace collector (phase 3)
├── peb-bootstrap/
│   ├── pom.xml
│   └── src/main/java/.../peb/bootstrap/
│       ├── PebApplication.java       # @SpringBootApplication
│       ├── config/
│       │   ├── KernelConfig.java     # Governance engine wiring
│       │   ├── HashConfig.java       # Hash service configuration
│       │   ├── StoreConfig.java      # Data source configuration
│       │   ├── ApiConfig.java        # REST/WebSocket configuration
│       │   └── AdapterConfig.java    # losm-ir adapter configuration
│       └── resources/
│           ├── application.yml       # Main configuration
│           ├── application-dev.yml   # Dev profile
│           └── db/migration/         # Flyway migrations (from peb-store)
└── peb-test/
    ├── pom.xml
    └── src/test/java/.../peb/test/
        ├── kernel/                   # Governance engine unit tests
        ├── admission/                # Admission controller tests
        ├── transaction/              # Transaction engine tests
        ├── hash/                     # Hash service tests (critical — verify Merkle properties)
        ├── api/                      # REST controller integration tests
        └── fixture/                  # Test factories and builders
```

### Dependency Graph

```
peb-domain     ← peb-store ← peb-core ← peb-api
                                    ↕          ↕
                              peb-hash    peb-adapters
                                               ↓
                                          peb-observability
                                               ↓
                                          peb-bootstrap
```

No circular dependencies. `peb-core` depends on `peb-domain`, `peb-store`,
`peb-hash`, and `peb-adapters`. `peb-api` depends only on `peb-core`.
`peb-bootstrap` wires everything.

---

## 2. Domain Model — Entities (`peb-domain`)

### 2.1 `PebState` Entity

```java
@Entity
@Table(name = "peb_state")
public class PebState {

    @Id
    private UUID id;

    @Column(unique = true, nullable = false, length = 64)
    private String key;                    // "invariants", "architecture", "trajectory", "intent"

    @Column(columnDefinition = "jsonb", nullable = false)
    private JsonNode content;              // Structured state (NOT raw markdown)

    @Column(columnDefinition = "jsonb")
    private JsonNode metadata;             // { "version", "author", "updatedAt" }

    @Column(length = 64, nullable = false)
    private String checksum;               // SHA-256 of content (independent per key)

    @Version
    private Long version;                  // Optimistic lock — monotonic counter

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;
}
```

**Invariants:**
- `key` must be one of the known keys (enforced by enum or validator)
- `checksum` = `SHA-256(content.toString())` computed on write
- `version` is incremented on every update
- Only `peb_state` rows may be modified by `PebTransaction` — no direct mutation

### 2.2 `PebDecision` Entity

```java
@Entity
@Table(name = "peb_decisions")
public class PebDecision {

    @Id
    private UUID id;

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "transaction_id", nullable = false)
    private PebTransaction transaction;    // Links to producing transaction

    @Column(length = 32)
    private String adrNumber;              // "ADR-007"

    @Column(nullable = false, length = 256)
    private String title;

    @Enumerated(STRING)
    @Column(nullable = false, length = 32)
    private DecisionStatus status;         // DRAFT, ACCEPTED, SUPERSEDED, REJECTED

    @Column(columnDefinition = "jsonb")
    private JsonNode summary;              // Structured rationale

    @Column(columnDefinition = "text[]")
    private List<String> affectedKeys;     // Which peb_state keys changed

    @Enumerated(STRING)
    @Column(length = 32)
    private EntropyClass entropyClass;     // COLLAPSER, SHAPER, NEUTRAL

    @Column(length = 64)
    private String beforeHash;             // peb_state_hash at transaction start

    @Column(length = 64)
    private String afterHash;              // peb_state_hash after commit

    @Column(nullable = false, length = 128)
    private String authorId;

    @Column(name = "parent_decision_id")
    private UUID parentDecisionId;         // Merkle link to previous decision

    @Column(name = "rollback_of")
    private UUID rollbackOf;               // If this rolls back a prior decision

    @Column(nullable = false)
    private Instant createdAt;
}
```

**Invariants:**
- `beforeHash` == `PebTransaction.startHash`
- `afterHash` == `PebTransaction.endHash`
- `parentDecisionId` forms a linked list (each decision references the prior one)
- If `rollbackOf` is set, the rolled-back decision's `status` becomes `SUPERSEDED`

### 2.3 `PebTransaction` Entity

```java
@Entity
@Table(name = "peb_transactions")
public class PebTransaction {

    @Id
    private UUID id;

    @Column(unique = true, nullable = false, length = 128)
    private String idempotencyKey;         // Caller-provided — enables safe retry

    @Column(nullable = false, length = 128)
    private String entityId;               // Who initiated

    @Enumerated(STRING)
    @Column(nullable = false, length = 16)
    private AdmissionResult admissionResult; // ALLOWED, REJECTED, ROUTED

    @Column(nullable = false, length = 64)
    private String toolName;               // Which MCP facade

    @Column(columnDefinition = "jsonb", nullable = false)
    private JsonNode input;                // Full request payload

    @Column(columnDefinition = "jsonb")
    private JsonNode output;               // Full response payload

    @Column(length = 64)
    private String beforeHash;             // peb_state_hash at begin

    @Column(length = 64)
    private String afterHash;              // peb_state_hash at commit (null if rolled back)

    @Column(columnDefinition = "jsonb")
    private JsonNode stateDelta;           // Which keys changed + new checksums

    @Column(nullable = false)
    private Instant createdAt;

    @Column
    private Instant committedAt;           // null if rolled back
}
```

**Invariants:**
- `idempotencyKey` is unique — replaying the same key returns the existing transaction
- `beforeHash` is captured at `begin()` and never changes
- `afterHash` is computed at `commit()` and may be null until then
- If `admissionResult == REJECTED`, the transaction never reaches `commit()`
- A `peb_transactions` row exists for *every* MCP tool call, even rejected ones

### 2.4 `PebTrace` Entity (Phase 3)

```java
@Entity
@Table(name = "peb_traces")
public class PebTrace {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID transactionId;

    @Column(nullable = false, length = 128)
    private String workRequestId;

    @Column(name = "parent_trace_id")
    private UUID parentTraceId;            // DAG parent

    @Column(nullable = false, length = 64)
    private String stage;                  // Cognitive role or skill

    @Column(columnDefinition = "jsonb")
    private JsonNode inputs;               // State summary at entry

    @Column(columnDefinition = "jsonb")
    private JsonNode causalEntries;        // Why transformation occurred

    @Column(columnDefinition = "jsonb")
    private JsonNode rejectedAlternatives; // Branch points considered

    @Column(nullable = false)
    private Float confidence;              // 0.0–1.0

    @Column(nullable = false, length = 16)
    private String status = "observational"; // ALWAYS observational — enforced

    @Column(nullable = false)
    private Instant createdAt;
}
```

**Critical invariant:** `status` must always be `"observational"`. This is
enforced at both the application layer (TraceCollector) and database layer
(CHECK constraint). No downstream consumer may treat trace as authoritative.

### 2.5 `PebViolation` Entity (Phase 4)

```java
@Entity
@Table(name = "peb_violations")
public class PebViolation {

    @Id
    private UUID id;

    @Column(name = "transaction_id")
    private UUID transactionId;

    @Enumerated(STRING)
    @Column(nullable = false, length = 32)
    private ViolationType violationType;   // AUTHORITY_LEAKAGE, STATE_DEPENDENCY, SEMANTIC_NORMALIZATION, RCL, TRANSFORM_INVALID

    @Enumerated(STRING)
    @Column(nullable = false, length = 8)
    private ViolationSeverity severity;    // HARD, SOFT

    @Column(length = 128)
    private String entityId;               // Who caused it

    @Column(length = 128)
    private String capabilityAttempted;    // What capability was attempted

    @Column(columnDefinition = "jsonb")
    private JsonNode context;              // Full request context

    @Enumerated(STRING)
    @Column(length = 16)
    private ViolationResolution resolution; // REJECTED, ROUTED, CLARIFIED

    @Column(nullable = false)
    private Instant createdAt;
}
```

### 2.6 `PebCapability` Entity

```java
@Entity
@Table(name = "peb_capabilities")
public class PebCapability {

    @Id
    private UUID id;

    @Column(nullable = false, length = 128)
    private String entityId;               // Agent, service, or human

    @Column(nullable = false, length = 128)
    private String capability;             // "cap:emit_work_request", "cap:mutate_state:key=invariants"

    @Column(length = 128)
    private String grantedBy;              // Who granted this capability

    @Column
    private Instant expiresAt;             // Optional TTL

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private boolean active = true;         // Soft revocation
}
```

**Capability token format:**
```
cap:<action>[:scope=<resource_type>:<filter>]
cap:emit_work_request
cap:validate_transform
cap:mutate_state:key=invariants
cap:read_state:key=trajectory
cap:append_trace:work_request_id=wr-042
```

---

## 3. Value Objects (`peb-domain`)

### 3.1 `PebStateHash`

```java
@Immutable
public record PebStateHash(String value) {

    public PebStateHash {
        Objects.requireNonNull(value, "Hash value must not be null");
        if (!value.matches("^[a-f0-9]{64}$")) {
            throw new IllegalArgumentException("Hash must be 64-char hex string: " + value);
        }
    }

    public static PebStateHash compute(String content) {
        return new PebStateHash(DigestUtils.sha256Hex(content));
    }

    public String prefixed() {
        return "sha256:" + value;
    }
}
```

### 3.2 `AdmissionResult`

```java
public sealed interface AdmissionResult
    permits AdmissionResult.Allow, AdmissionResult.Reject, AdmissionResult.Route {

    record Allow(PebStateHash stateHash) implements AdmissionResult {}
    record Reject(Violation violation) implements AdmissionResult {}
    record Route(ExceptionEvent event) implements AdmissionResult {}
}
```

### 3.3 `CapabilityToken`

```java
@Immutable
public record CapabilityToken(String value) {

    // Pattern: cap:<action>[:scope=<type>:<filter>]
    private static final Pattern TOKEN_PATTERN =
        Pattern.compile("^cap:[a-z_]+(:scope=[a-z_]+:[a-zA-Z0-9_=-]+)?$");

    public CapabilityToken {
        Objects.requireNonNull(value, "Token must not be null");
        if (!TOKEN_PATTERN.matcher(value).matches()) {
            throw new IllegalArgumentException("Invalid capability token: " + value);
        }
    }

    public String action() {
        return value.split(":")[1];
    }

    public Optional<String> scopeType() {
        var parts = value.split(":");
        return parts.length >= 4 ? Optional.of(parts[2].replace("scope=", "")) : Optional.empty();
    }
}
```

### 3.4 `WorkStatus` (from losm-ir)

```java
public enum WorkStatus {
    NEW, INTAKE, PLAN_GENERATION, PLAN_REVIEW, PLAN_APPROVAL_GATE,
    SPEC_GENERATION, EXECUTION, VALIDATION, COMPLETION, BLOCKED, FAILED;
}
```

### 3.5 Supporting Enums

```java
public enum CognitiveMode {
    INTAKE, ANALYZING, PLANNING, CRITIQUING, APPROVING,
    SPECIFYING, EXECUTING, VALIDATING, REFLECTING, ESCALATING;
}

public enum DecisionStatus { DRAFT, ACCEPTED, SUPERSEDED, REJECTED; }

public enum EntropyClass { COLLAPSER, SHAPER, NEUTRAL; }

public enum ViolationType {
    AUTHORITY_LEAKAGE, STATE_DEPENDENCY, SEMANTIC_NORMALIZATION,
    RCL_VIOLATION, TRANSFORM_INVALID;
}

public enum ViolationSeverity { HARD, SOFT; }

public enum ViolationResolution { REJECTED, ROUTED, CLARIFIED; }
```

---

## 4. Core Services (`peb-core`)

### 4.1 `PebGovernanceEngine`

The top-level orchestrator. Every MCP tool facade calls this. It owns the
sequence: admission → transaction → commit.

```java
@Service
public class PebGovernanceEngine {

    private final AdmissionController admissionController;
    private final PebTransactionEngine transactionEngine;
    private final PebHashService hashService;
    private final InvariantValidator invariantValidator;
    private final PebTransactionRepository transactionRepository;

    public PebGovernanceEngine(
            AdmissionController admissionController,
            PebTransactionEngine transactionEngine,
            PebHashService hashService,
            InvariantValidator invariantValidator,
            PebTransactionRepository transactionRepository
    ) { /* constructor injection */ }

    /**
     * Execute a governance operation. This is the single entry point for all
     * MCP tool facades. Every operation passes through:
     *   1. Admission control (capability + invariant + transition checks)
     *   2. Transaction begin (captures before-hash, idempotency check)
     *   3. Mutation execution (specific to the operation)
     *   4. Transaction commit (updates hash, records audit row)
     *
     * @param request the typed governance operation request
     * @param <T>     the operation type
     * @return GovernanceResult containing admission result, transaction ID,
     *         and operation-specific response
     */
    public <T extends GovernanceRequest> GovernanceResult<T> execute(T request) {
        // 1. Idempotency check — if transaction already exists, return it
        var existing = transactionRepository.findByIdempotencyKey(request.idempotencyKey());
        if (existing.isPresent()) {
            return GovernanceResult.from(existing.get());
        }

        // 2. Admission control
        var admission = admissionController.admit(request);
        if (admission instanceof AdmissionResult.Reject r) {
            // Record violation, return rejection
            return GovernanceResult.rejected(r.violation());
        }
        if (admission instanceof AdmissionResult.Route r) {
            // Route to observation stream but allow execution
            observability.violationStream().emit(r.event());
        }

        // 3. Begin transaction
        var tx = transactionEngine.begin(request);

        try {
            // 4. Execute operation-specific logic
            var result = request.execute(tx, invariantValidator, hashService);

            // 5. Commit
            var committed = transactionEngine.commit(tx, result);

            return GovernanceResult.success(committed, result);

        } catch (Exception e) {
            transactionEngine.rollback(tx);
            throw new GovernanceException("Transaction failed", e);
        }
    }
}
```

### 4.2 `AdmissionController`

The gate. Every `execute()` call passes through this. It never skips checks.

```java
@Service
public class AdmissionController {

    private final PebCapabilityRepository capabilityRepository;
    private final PebStateRepository stateRepository;
    private final InvariantValidator invariantValidator;
    private final LosmIrTransitionAdapter transitionAdapter;

    /**
     * Execute the admission control pipeline for a governance request.
     * Checks are ordered: capability → invariant → transition → resource.
     * The first failure short-circuits.
     */
    public AdmissionResult admit(GovernanceRequest request) {

        // 1. Capability check — does the entity hold the required token?
        var capabilityResult = checkCapability(request.entityId(), request.requiredCapability());
        if (capabilityResult.isPresent()) {
            return capabilityResult.get(); // Reject
        }

        // 2. Invariant check — does the action violate any hard law?
        var invariantResult = invariantValidator.validate(request);
        if (invariantResult.isPresent()) {
            return invariantResult.get(); // Reject or Route
        }

        // 3. Transition check — is the state transition legal?
        if (request instanceof TransitionRequest tr) {
            var transitionResult = transitionAdapter.validateTransition(tr.fromState(), tr.toState());
            if (!transitionResult.allowed()) {
                return new AdmissionResult.Reject(
                    new Violation(...)  // TRANSITION_INVALID
                );
            }
        }

        // 4. Resource check — does the entity own the target state?
        if (request instanceof StateMutationRequest smr) {
            for (var key : smr.affectedKeys()) {
                var resourceResult = checkResourceAccess(request.entityId(), key);
                if (resourceResult.isPresent()) {
                    return resourceResult.get();
                }
            }
        }

        // All checks passed
        return new AdmissionResult.Allow(hashService.currentStateHash());
    }

    private Optional<AdmissionResult> checkCapability(String entityId, String requiredCapability) {
        // Query peb_capabilities for active tokens matching entityId + capability
        // If not found, return Reject with AUTHORITY_LEAKAGE violation
    }

    private Optional<AdmissionResult> checkResourceAccess(String entityId, String stateKey) {
        // If the action requires write access to a peb_state key,
        // check entity has cap:mutate_state:key=<stateKey>
    }
}
```

### 4.3 `PebTransactionEngine`

Manages transaction lifecycle. Each transaction has a begin/commit/rollback
lifecycle. Transactions are persisted in `peb_transactions`.

```java
@Service
public class PebTransactionEngine {

    private final PebTransactionRepository repository;
    private final PebHashService hashService;

    /**
     * Begin a new transaction. Captures before-hash.
     * If a transaction with this idempotency key already exists, returns it
     * (the caller in PebGovernanceEngine handles this case).
     */
    public PebTransaction begin(GovernanceRequest request) {
        var tx = new PebTransaction();
        tx.setId(UUID.randomUUID());
        tx.setIdempotencyKey(request.idempotencyKey());
        tx.setEntityId(request.entityId());
        tx.setToolName(request.toolName());
        tx.setInput(request.toJson());
        tx.setBeforeHash(hashService.currentStateHash().value());
        tx.setAdmissionResult(AdmissionResult.ALLOWED); // Set during admission
        tx.setCreatedAt(Instant.now());

        return repository.save(tx); // Persist immediately — ensures idempotency
    }

    /**
     * Commit a transaction. Computes after-hash, records state delta,
     * sets committedAt.
     */
    public PebTransaction commit(PebTransaction tx, OperationResult result) {
        tx.setOutput(result.toJson());
        tx.setStateDelta(result.stateDelta());
        tx.setAfterHash(hashService.currentStateHash().value());
        tx.setCommittedAt(Instant.now());

        return repository.save(tx);
    }

    /**
     * Rollback a transaction. Does NOT set afterHash or committedAt.
     * The transaction row remains with admissionResult and beforeHash only.
     */
    public void rollback(PebTransaction tx) {
        // Log rollback. Transaction remains as evidence of the failed attempt.
        log.warn("Transaction rolled back: {} ({})", tx.getId(), tx.getToolName());
    }
}
```

### 4.4 `InvariantValidator`

Validates actions against the 3 hard laws.

```java
@Service
public class InvariantValidator {

    private final PebStateRepository stateRepository;

    /**
     * Validate a request against hard invariants.
     * Returns empty if all pass, or the AdmissionResult (Reject or Route).
     *
     * Hard laws enforced:
     * 1. No Authority Leakage — executor may not emit WorkRequest
     * 2. State Dependency — mutations must reference existing peb_state keys
     * 3. Semantic Normalization — structured output must be valid JSON
     */
    public Optional<AdmissionResult> validate(GovernanceRequest request) {

        // Law 1: Authority Leakage
        if (request instanceof AuthoritySensitiveRequest asr) {
            if (!asr.isAuthorityAllowed()) {
                return Optional.of(new AdmissionResult.Reject(
                    Violation.authorityLeakage(request.entityId(), asr.actionDescription())
                ));
            }
        }

        // Law 2: State Dependency
        if (request instanceof StateMutationRequest smr) {
            for (var key : smr.affectedKeys()) {
                if (!stateRepository.existsByKey(key)) {
                    return Optional.of(new AdmissionResult.Reject(
                        Violation.stateDependency(request.entityId(), key)
                    ));
                }
            }
        }

        // Law 3: Semantic Normalization
        if (request instanceof StructuredOutputRequest sor) {
            if (!sor.outputStructure().isValidJsonSchema()) {
                return Optional.of(new AdmissionResult.Reject(
                    Violation.semanticNormalization(request.entityId(), sor.outputStructure().error())
                ));
            }
        }

        return Optional.empty();
    }
}
```

### 4.5 Transform Validator (stub for Phase 1)

```java
@Service
public class TransformValidator {

    /**
     * Validate a proposed transform. Full implementation in Phase 3.
     * Phase 1: only checks that the entity has the required capability.
     *
     * Transform rules (from Plurality spec):
     * - StateView ⊆ entity's allowed reads
     * - StateDelta ⊆ entity's allowed writes
     * - Context rules ⊆ PEB invariants
     */
    public ValidationResult validate(TransformRequest request) {
        // Phase 1: capability check only (admission controller handles this)
        // Phase 3: full transform signature validation
        return ValidationResult.valid();
    }
}
```

---

## 5. Hash Service (`peb-hash`)

### 5.1 `PebHashService`

Isolated hash computation service. Incremental Merkle — O(1) per mutation.

```java
@Service
public class PebHashService {

    private final PebStateRepository stateRepository;
    private final PebDecisionRepository decisionRepository;

    @Cacheable("pebStateHash") // Invalidated on transaction commit
    public PebStateHash currentStateHash() {
        var documentHashes = computeDocumentHashes();
        var lastDecisionHash = computeLastDecisionHash();

        return PebStateHash.compute(
            "invariants:"    + documentHashes.get("invariants")    +
            "architecture:"  + documentHashes.get("architecture")  +
            "trajectory:"    + documentHashes.get("trajectory")    +
            "intent:"        + documentHashes.get("intent")        +
            "last_decision:" + lastDecisionHash
        );
    }

    /** Return per-document hashes (for peb://state/hash resource). */
    public Map<String, String> documentHashes() {
        return computeDocumentHashes();
    }

    /** Return the rolling hash of the decision chain. */
    public String lastDecisionHash() {
        return computeLastDecisionHash();
    }

    // --- Private helpers ---

    private Map<String, String> computeDocumentHashes() {
        // SELECT key, checksum FROM peb_state — each document has its own
        // pre-computed checksum. No recomputation needed unless state changed.
        return stateRepository.findAll()
            .stream()
            .collect(Collectors.toMap(PebState::getKey, PebState::getChecksum));
    }

    private String computeLastDecisionHash() {
        // SELECT id, parent_decision_id, after_hash
        // FROM peb_decisions ORDER BY created_at DESC LIMIT 1
        // If no decisions exist, return "SHA256(NULL)"
        var lastDecision = decisionRepository.findTopByOrderByCreatedAtDesc();
        if (lastDecision.isEmpty()) {
            return DigestUtils.sha256Hex("NULL");
        }
        var d = lastDecision.get();
        return DigestUtils.sha256Hex(
            d.getId().toString() +
            (d.getParentDecisionId() != null ? d.getParentDecisionId().toString() : "NULL") +
            d.getAfterHash()
        );
    }
}
```

### 5.2 `DocumentChecksumUpdater`

Called when `peb_state` content changes (within `PebTransaction`).

```java
@Component
public class DocumentChecksumUpdater {

    /** Called by PebStateRepository on every peb_state update. */
    @EventListener
    public void onPebStateChanged(PebStateChangedEvent event) {
        // Recompute checksum for the changed document
        var newChecksum = DigestUtils.sha256Hex(event.newContent().toString());
        event.entity().setChecksum(newChecksum);
        // This invalidates the PebHashService cache
        // (via @CacheEvict on the save operation)
    }
}
```

### 5.3 Merkle Properties (Verification Tests)

The hash tree must satisfy:

1. **Determinism:** Same state sequence → same root hash (regardless of timing)
2. **Merkle consistency:** Changing one document only changes that document's
   hash and the root hash — other document hashes remain unchanged
3. **Decision chain traversal:** Given any decision, you can verify it links
   to its parent via `SHA256(parent.id ++ grandparent ++ parent.afterHash)`
4. **Collision resistance:** Two different state sequences produce different
   root hashes (by SHA-256 property)

---

## 6. Repositories (`peb-store`)

### 6.1 Spring Data JPA Interfaces

```java
@Repository
public interface PebStateRepository extends JpaRepository<PebState, UUID> {
    Optional<PebState> findByKey(String key);
    boolean existsByKey(String key);
    // @CacheEvict on save/delete invalidates PebHashService cache
}

@Repository
public interface PebDecisionRepository extends JpaRepository<PebDecision, UUID> {
    List<PebDecision> findTop20ByOrderByCreatedAtDesc();
    Optional<PebDecision> findTopByOrderByCreatedAtDesc();
    List<PebDecision> findByParentDecisionId(UUID parentId);
}

@Repository
public interface PebTransactionRepository extends JpaRepository<PebTransaction, UUID> {
    Optional<PebTransaction> findByIdempotencyKey(String idempotencyKey);
    List<PebTransaction> findByEntityIdOrderByCreatedAtDesc(String entityId);
}

@Repository
public interface PebCapabilityRepository extends JpaRepository<PebCapability, UUID> {
    List<PebCapability> findByEntityIdAndActiveTrue(String entityId);
    Optional<PebCapability> findByEntityIdAndCapabilityAndActiveTrue(String entityId, String capability);
    boolean existsByEntityIdAndCapabilityAndActiveTrue(String entityId, String capability);
}

@Repository
public interface PebTraceRepository extends JpaRepository<PebTrace, UUID> {
    List<PebTrace> findByWorkRequestIdOrderByCreatedAtAsc(String workRequestId);
}

@Repository
public interface PebViolationRepository extends JpaRepository<PebViolation, UUID> {
    List<PebViolation> findByTransactionId(UUID transactionId);
    List<PebViolation> findBySeverityAndCreatedAtAfter(ViolationSeverity severity, Instant after);
}
```

### 6.2 Flyway Migrations

```sql
-- V1__initial_schema.sql

CREATE TABLE peb_state (
    id          UUID PRIMARY KEY,
    key         VARCHAR(64) UNIQUE NOT NULL,
    content     JSONB NOT NULL,
    metadata    JSONB,
    checksum    VARCHAR(64) NOT NULL,
    version     BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE peb_transactions (
    id               UUID PRIMARY KEY,
    idempotency_key  VARCHAR(128) UNIQUE NOT NULL,
    entity_id        VARCHAR(128) NOT NULL,
    admission_result VARCHAR(16) NOT NULL CHECK (admission_result IN ('ALLOWED','REJECTED','ROUTED')),
    tool_name        VARCHAR(64) NOT NULL,
    input            JSONB NOT NULL,
    output           JSONB,
    before_hash      VARCHAR(64),
    after_hash       VARCHAR(64),
    state_delta      JSONB,
    created_at       TIMESTAMPTZ NOT NULL,
    committed_at     TIMESTAMPTZ
);

CREATE TABLE peb_decisions (
    id                  UUID PRIMARY KEY,
    transaction_id      UUID NOT NULL REFERENCES peb_transactions(id),
    adr_number          VARCHAR(32),
    title               VARCHAR(256) NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    summary             JSONB,
    affected_keys       TEXT[],
    entropy_class       VARCHAR(32),
    before_hash         VARCHAR(64),
    after_hash          VARCHAR(64),
    author_id           VARCHAR(128) NOT NULL,
    parent_decision_id  UUID REFERENCES peb_decisions(id),
    rollback_of         UUID REFERENCES peb_decisions(id),
    created_at          TIMESTAMPTZ NOT NULL
);

CREATE TABLE peb_capabilities (
    id           UUID PRIMARY KEY,
    entity_id    VARCHAR(128) NOT NULL,
    capability   VARCHAR(128) NOT NULL,
    granted_by   VARCHAR(128),
    expires_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL,
    active       BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (entity_id, capability)
);

CREATE TABLE peb_traces (
    id                   UUID PRIMARY KEY,
    transaction_id       UUID NOT NULL REFERENCES peb_transactions(id),
    work_request_id      VARCHAR(128) NOT NULL,
    parent_trace_id      UUID REFERENCES peb_traces(id),
    stage                VARCHAR(64) NOT NULL,
    inputs               JSONB,
    causal_entries       JSONB,
    rejected_alternatives JSONB,
    confidence           REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    status               VARCHAR(16) NOT NULL DEFAULT 'observational'
                         CHECK (status = 'observational'),
    created_at           TIMESTAMPTZ NOT NULL
);

CREATE TABLE peb_violations (
    id                   UUID PRIMARY KEY,
    transaction_id       UUID REFERENCES peb_transactions(id),
    violation_type       VARCHAR(32) NOT NULL,
    severity             VARCHAR(8) NOT NULL CHECK (severity IN ('HARD','SOFT')),
    entity_id            VARCHAR(128),
    capability_attempted VARCHAR(128),
    context              JSONB,
    resolution           VARCHAR(16),
    created_at           TIMESTAMPTZ NOT NULL
);

-- Indexes
CREATE INDEX idx_peb_decisions_parent ON peb_decisions(parent_decision_id);
CREATE INDEX idx_peb_decisions_created ON peb_decisions(created_at DESC);
CREATE INDEX idx_peb_capabilities_entity ON peb_capabilities(entity_id, active);
CREATE INDEX idx_peb_traces_wr ON peb_traces(work_request_id);
CREATE INDEX idx_peb_traces_parent ON peb_traces(parent_trace_id);
CREATE INDEX idx_peb_violations_severity ON peb_violations(severity, created_at);
CREATE INDEX idx_peb_transactions_idempotency ON peb_transactions(idempotency_key);
```

---

## 7. API Layer — MCP Tool Facades (`peb-api`)

### 7.1 Design Principle

Controllers contain **no business logic**. They deserialize, call
`PebGovernanceEngine.execute()`, and serialize the response. That's it.

Every controller method follows the same pattern:

```java
@PostMapping("/tools/peb_validate_transition")
public ResponseEntity<GovernanceResponse> validateTransition(
        @RequestBody @Valid ValidateTransitionRequest request) {

    var result = engine.execute(request.toGovernanceRequest());
    return ResponseEntity.ok(GovernanceResponse.from(result));
}
```

### 7.2 Phase 1 Endpoints

```java
@RestController
@RequestMapping("/api/v1/peb")
public class PebTransitionController {

    private final PebGovernanceEngine engine;

    public PebTransitionController(PebGovernanceEngine engine) {
        this.engine = engine;
    }

    @PostMapping("/validate-transition")
    public ResponseEntity<TransitionValidationResponse> validateTransition(
            @RequestBody @Valid ValidateTransitionRequest request) {

        // Validation: fromState and toState must be valid WorkStatus values
        // Engine: PebGovernanceEngine.execute() → AdmissionController → transaction
        var result = engine.execute(request.toGovernanceRequest());

        return result.admissionResult() instanceof AdmissionResult.Allow
            ? ResponseEntity.ok(TransitionValidationResponse.allowed(result))
            : ResponseEntity.ok(TransitionValidationResponse.rejected(result));
    }
}


@RestController
@RequestMapping("/api/v1/peb")
public class PebHashController {

    private final PebHashService hashService;

    @GetMapping("/hash")
    public ResponseEntity<HashResponse> getHash() {
        return ResponseEntity.ok(new HashResponse(
            hashService.currentStateHash().prefixed(),
            hashService.documentHashes(),
            hashService.lastDecisionHash()
        ));
    }
}


@RestController
@RequestMapping("/api/v1/peb")
public class PebStateController {

    private final PebStateRepository stateRepository;

    @GetMapping("/state/{key}")
    public ResponseEntity<StateResponse> getState(@PathVariable String key) {
        return stateRepository.findByKey(key)
            .map(s -> ResponseEntity.ok(StateResponse.from(s)))
            .orElse(ResponseEntity.notFound().build());
    }
}
```

### 7.3 Request/Response DTOs

```java
// --- ValidateTransition ---

public record ValidateTransitionRequest(
    String entityId,
    String idempotencyKey,
    String fromState,
    String toState
) {
    public GovernanceRequest toGovernanceRequest() {
        return new TransitionRequest(
            idempotencyKey, entityId, "peb_validate_transition",
            "cap:validate_transition",
            WorkStatus.valueOf(fromState), WorkStatus.valueOf(toState)
        );
    }
}

public record TransitionValidationResponse(
    boolean allowed,
    String reason,
    String admissionResult,
    UUID transactionId,
    String stateHash
) {
    static TransitionValidationResponse allowed(GovernanceResult<?> result) {
        return new TransitionValidationResponse(true, null, "ALLOWED",
            result.transactionId(), result.stateHash());
    }
    static TransitionValidationResponse rejected(GovernanceResult<?> result) {
        return new TransitionValidationResponse(false,
            result.violation().message(), "REJECTED",
            result.transactionId(), result.stateHash());
    }
}

// --- Hash ---

public record HashResponse(
    String pebStateHash,
    Map<String, String> documentHashes,
    String lastDecisionHash
) {}

// --- State ---

public record StateResponse(
    String key,
    JsonNode content,
    JsonNode metadata,
    String checksum,
    Instant updatedAt
) {
    static StateResponse from(PebState s) {
        return new StateResponse(s.getKey(), s.getContent(),
            s.getMetadata(), s.getChecksum(), s.getUpdatedAt());
    }
}
```

### 7.4 Error Handling

```java
@RestControllerAdvice
public class PebExceptionHandler {

    @ExceptionHandler(GovernanceException.class)
    public ResponseEntity<ErrorResponse> handleGovernance(GovernanceException ex) {
        return ResponseEntity.status(422).body(
            new ErrorResponse("GOVERNANCE_ERROR", ex.getMessage(), ex.getTransactionId())
        );
    }

    @ExceptionHandler(AdmissionRejectedException.class)
    public ResponseEntity<ErrorResponse> handleAdmissionRejected(AdmissionRejectedException ex) {
        return ResponseEntity.status(403).body(
            new ErrorResponse("ADMISSION_REJECTED", ex.getMessage(), ex.getViolation())
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        return ResponseEntity.badRequest().body(
            new ErrorResponse("VALIDATION_ERROR", "Request validation failed", ex.getFieldErrors())
        );
    }
}

public record ErrorResponse(
    String code,
    String message,
    Object details
) {}

public class GovernanceException extends RuntimeException {
    private final UUID transactionId;
    public GovernanceException(String message, UUID transactionId, Throwable cause) {
        super(message, cause);
        this.transactionId = transactionId;
    }
    public UUID getTransactionId() { return transactionId; }
}

public class AdmissionRejectedException extends RuntimeException {
    private final Violation violation;
    public AdmissionRejectedException(Violation violation) {
        super(violation.message());
        this.violation = violation;
    }
    public Violation getViolation() { return violation; }
}
```

---

## 8. Internal Request Model (`peb-core`)

The typed request hierarchy used by the governance engine internally.
MCP DTOs are converted to these domain requests before processing.

```java
// --- Base request ---

public sealed interface GovernanceRequest
    permits TransitionRequest, StateMutationRequest, ReadRequest, TransformRequest, ExtensionRequest {

    String idempotencyKey();
    String entityId();
    String toolName();
    String requiredCapability();
    JsonNode toJson();
}

// --- Transition validation ---

public record TransitionRequest(
    String idempotencyKey,
    String entityId,
    String toolName,
    String requiredCapability,
    WorkStatus fromState,
    WorkStatus toState
) implements GovernanceRequest {
    public JsonNode toJson() {
        return JsonNodeFactory.instance.objectNode()
            .put("fromState", fromState.name())
            .put("toState", toState.name());
    }
}

// --- State mutation (decision recording, extension proposals) ---

public record StateMutationRequest(
    String idempotencyKey,
    String entityId,
    String toolName,
    String requiredCapability,
    List<String> affectedKeys,
    JsonNode proposedContent,
    String mutationType               // "decision", "extension", "update"
) implements GovernanceRequest, AuthoritySensitiveRequest, StateDependencyRequest, StructuredOutputRequest {
    public JsonNode toJson() { /* serialize affected keys + proposed content */ }
    public String actionDescription() { return "mutate_state:" + String.join(",", affectedKeys); }
    public boolean isAuthorityAllowed() { /* check capability covers all affected keys */ }
    public JsonSchema outputStructure() { /* return expected JSON schema for mutation type */ }
}

// --- Read request (no mutation) ---

public record ReadRequest(
    String idempotencyKey,
    String entityId,
    String toolName,
    String requiredCapability,
    String resourceUri
) implements GovernanceRequest {
    public JsonNode toJson() { /* serialize resource URI */ }
}

// --- Transform validation ---

public record TransformRequest(
    String idempotencyKey,
    String entityId,
    String toolName,
    String requiredCapability,
    JsonNode stateView,
    JsonNode context,
    JsonNode proposedDelta,
    String workRequestId
) implements GovernanceRequest {
    public JsonNode toJson() { /* serialize transform parameters */ }
}

// --- Extension proposal ---

public record ExtensionRequest(
    String idempotencyKey,
    String entityId,
    String toolName,
    String requiredCapability,
    String gapDescription,
    JsonNode proposedContent,
    String targetKey
) implements GovernanceRequest, StateDependencyRequest, StructuredOutputRequest {
    // implements state dependency check (targetKey must exist or be new)
    // implements semantic normalization check (proposedContent must be valid JSONB structure)
}
```

### Marker interfaces for invariant checks:

```java
public interface AuthoritySensitiveRequest {
    String actionDescription();
    boolean isAuthorityAllowed();
}

public interface StateDependencyRequest {
    List<String> affectedKeys();
}

public interface StructuredOutputRequest {
    JsonSchema outputStructure();  // or similar schema descriptor
}
```

---

## 9. Adapters (`peb-adapters`)

### 9.1 `LosmIrTransitionAdapter`

Wraps the Python `losm_ir.transition` module via a sidecar or embedded call.
For Phase 1, a local Java implementation of the transition table is preferred
(simple enum map — no need for Python interop in Phase 1).

```java
@Component
public class LosmIrTransitionAdapter {

    private static final Map<WorkStatus, Set<WorkStatus>> VALID_TRANSITIONS = Map.of(
        NEW,             Set.of(INTAKE, FAILED, BLOCKED),
        INTAKE,          Set.of(PLAN_GENERATION, FAILED, BLOCKED),
        PLAN_GENERATION,  Set.of(PLAN_REVIEW, FAILED, BLOCKED),
        PLAN_REVIEW,      Set.of(PLAN_APPROVAL_GATE, PLAN_GENERATION, FAILED, BLOCKED),
        PLAN_APPROVAL_GATE, Set.of(SPEC_GENERATION, PLAN_GENERATION, FAILED, BLOCKED),
        SPEC_GENERATION,  Set.of(EXECUTION, FAILED, BLOCKED),
        EXECUTION,        Set.of(VALIDATION, FAILED, BLOCKED),
        VALIDATION,       Set.of(COMPLETION, EXECUTION, PLAN_GENERATION, FAILED, BLOCKED),
        BLOCKED,          Set.of(NEW, INTAKE, PLAN_GENERATION, PLAN_REVIEW, PLAN_APPROVAL_GATE,
                                  SPEC_GENERATION, EXECUTION, VALIDATION, FAILED, COMPLETION),
        COMPLETION,       Set.of(),
        FAILED,           Set.of()
    );

    /**
     * Validate a WorkStatus transition against the canonical transition table.
     *
     * @param fromState current pipeline state
     * @param toState desired next state
     * @return ValidationResult with allowed=true/false and reason
     */
    public ValidationResult validateTransition(WorkStatus fromState, WorkStatus toState) {
        var allowed = VALID_TRANSITIONS.get(fromState);
        if (allowed == null) {
            return ValidationResult.invalid("Unknown fromState: " + fromState);
        }
        if (allowed.contains(toState)) {
            return ValidationResult.valid();
        }
        return ValidationResult.invalid(
            "'" + fromState + "' → '" + toState + "' is not a legal transition."
        );
    }

    public record ValidationResult(boolean allowed, String reason) {
        public static ValidationResult valid() { return new ValidationResult(true, null); }
        public static ValidationResult invalid(String reason) { return new ValidationResult(false, reason); }
    }
}
```

### 9.2 Adapter SPI

```java
/**
 * Service Provider Interface for transition validation.
 * The default implementation uses the embedded transition table.
 * A future implementation may delegate to the Python losm_ir process.
 */
public interface TransitionValidator {
    LosmIrTransitionAdapter.ValidationResult validateTransition(WorkStatus fromState, WorkStatus toState);
}
```

### 9.3 Conduit Adapter (Phase 2+)

```java
/**
 * Adapter for the existing conduit-mcp server.
 * In Phase 1, this is a stub. Phase 2 adds:
 * - Forwarding PEB state changes to conduit-mcp
 * - Receiving WorkRequest lifecycle events from conduit-mcp
 */
@Component
public class ConduitMcpAdapter {
    // Phase 1: stub
    // Phase 2: REST client to conduit-mcp server
}
```

---

## 10. Configuration (`peb-bootstrap`)

### 10.1 Application YAML

```yaml
spring:
  application:
    name: peb-kernel

  datasource:
    url: jdbc:postgresql://${PEB_DB_HOST:localhost}:${PEB_DB_PORT:5432}/${PEB_DB_NAME:nebula}
    username: ${PEB_DB_USER:nebula}
    password: ${PEB_DB_PASSWORD:nebula}

  jpa:
    hibernate:
      ddl-auto: validate     # Flyway manages schema
    show-sql: false
    properties:
      hibernate:
        jdbc:
          batch_size: 25

  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true

server:
  port: ${PEB_PORT:8200}
  servlet:
    context-path: /api/v1

peb:
  kernel:
    cache-ttl-seconds: 300         # PebHashService cache TTL
    idempotency-ttl-hours: 24      # How long to retain idempotency keys
  hash:
    algorithm: SHA-256
  admission:
    require-capability: true       # Can be disabled in dev for testing
```

### 10.2 Java Configuration Classes

```java
@Configuration
@EnableCaching
public class KernelConfig {

    @Bean
    public PebGovernanceEngine governanceEngine(
            AdmissionController admissionController,
            PebTransactionEngine transactionEngine,
            PebHashService hashService,
            InvariantValidator invariantValidator,
            PebTransactionRepository transactionRepository) {
        return new PebGovernanceEngine(
            admissionController, transactionEngine, hashService,
            invariantValidator, transactionRepository);
    }
}

@Configuration
public class HashConfig {

    @Bean
    @CacheManager
    public CacheManager hashCacheManager() {
        var config = new CacheConfiguration();
        config.setTtlSeconds(300);  // From peb.kernel.cache-ttl-seconds
        return new CaffeineCacheManager("pebStateHash", config);
    }
}

@Configuration
public class StoreConfig {

    @Bean
    @Primary
    public DataSource dataSource(
            @Value("${spring.datasource.url}") String url,
            @Value("${spring.datasource.username}") String username,
            @Value("${spring.datasource.password}") String password) {
        return DataSourceBuilder.create()
            .url(url)
            .username(username)
            .password(password)
            .driverClassName("org.postgresql.Driver")
            .build();
    }
}
```

### 10.3 Application Entry Point

```java
@SpringBootApplication(scanBasePackages = "io.nexus.peb")
@EnableJpaRepositories(basePackages = "io.nexus.peb.store")
@EntityScan(basePackages = "io.nexus.peb.domain")
public class PebApplication {

    public static void main(String[] args) {
        SpringApplication.run(PebApplication.class, args);
    }
}
```

---

## 11. Testing Strategy (`peb-test`)

### 11.1 Test Layers

| Layer | Type | Framework | Covers |
|-------|------|-----------|--------|
| **Unit** | Isolated | JUnit 5 + Mockito | Service logic, validator rules, hash computation |
| **Integration** | Spring context | @SpringBootTest | Repository queries, transaction lifecycle, admission pipeline |
| **Contract** | HTTP | @WebMvcTest + MockMvc | API endpoint contracts, request validation, error mapping |
| **Hash** | Property-based | jqwik | Merkle properties: determinism, collison resistance |
| **Admission** | Scenario | JUnit 5 + Testcontainers | Full admission pipeline against real PostgreSQL |

### 11.2 Critical Test Cases (Phase 1)

```java
class PebGovernanceEngineTest {

    @Test
    void shouldRejectTransitionWhenEntityLacksCapability() {
        // Given: entity "agent-01" does NOT have cap:validate_transition
        // When: execute(validateTransition(NEW → INTAKE))
        // Then: admissionResult is REJECTED, violation is AUTHORITY_LEAKAGE
    }

    @Test
    void shouldAllowTransitionWhenEntityHasCapability() {
        // Given: entity "agent-01" HAS cap:validate_transition
        // When: execute(validateTransition(NEW → INTAKE))
        // Then: admissionResult is ALLOWED, transaction is committed
    }

    @Test
    void shouldReturnSameResultForIdempotentRequest() {
        // Given: first execute() succeeds
        // When: second execute() with same idempotencyKey
        // Then: returns existing transaction, no duplicate commit
    }

    @Test
    void shouldRejectIllegalTransition() {
        // Given: entity has capability
        // When: execute(validateTransition(NEW → COMPLETION))
        // Then: admissionResult is REJECTED, violation is TRANSFORM_INVALID
    }
}

class PebHashServiceTest {

    @Test
    void hashShouldBeDeterministic() {
        // Given: same peb_state content and same decision chain
        // When: hashService.currentStateHash() called twice
        // Then: both calls return identical hash
    }

    @Test
    void changingOneDocumentShouldNotAffectOtherDocumentHashes() {
        // Given: peb_state has keys "invariants" and "architecture"
        // When: "invariants" content changes
        // Then: documentHashes()["architecture"] remains unchanged
    }

    @Test
    void hashShouldChangeWhenDecisionIsAppended() {
        // Given: existing state with last_decision_hash = X
        // When: new decision is recorded
        // Then: peb_state_hash changes (last_decision_hash component changes)
    }

    @Test
    void hashComputationShouldBeO1() {
        // Given: 1 document vs 1000 documents
        // When: hashService.currentStateHash() called
        // Then: execution time does not scale with document count
        // (each document has pre-computed checksum field)
    }
}

class AdmissionControllerTest {

    @Test
    void shouldCheckCapabilityBeforeInvariant() {
        // Given: entity lacks capability, action would violate invariant
        // When: admissionController.admit()
        // Then: REJECTED with AUTHORITY_LEAKAGE (capability check runs first)
    }

    @Test
    void shouldCheckTransitionAfterCapability() {
        // Given: entity has capability
        // When: admissionController.admit() with illegal transition
        // Then: REJECTED with TRANSFORM_INVALID
    }

    @Test
    void shouldAllowWhenAllChecksPass() {
        // Given: entity has capability, transition is legal, invariants pass
        // When: admissionController.admit()
        // Then: ALLOW
    }
}

class PebTransactionEngineTest {

    @Test
    void beginShouldPersistTransactionImmediately() {
        // Given: PebTransactionEngine
        // When: transaction.begin()
        // Then: row exists in peb_transactions with beforeHash set
    }

    @Test
    void commitShouldSetAfterHashAndCommittedAt() {
        // Given: transaction has begun
        // When: transaction.commit()
        // Then: afterHash is set, committedAt is set
    }

    @Test
    void rollbackShouldNotSetAfterHash() {
        // Given: transaction has begun
        // When: transaction.rollback()
        // Then: afterHash is null, committedAt is null
    }
}
```

### 11.3 Test Fixtures

```java
public class PebFixtures {

    public static PebState invariantsState() {
        var s = new PebState();
        s.setId(UUID.randomUUID());
        s.setKey("invariants");
        s.setContent(JsonNodeFactory.instance.objectNode()
            .put("authorityLeakage", "EXECUTORS may not emit WorkRequests")
            .put("stateDependency", "Decisions must reference existing PEB state")
            .put("semanticNormalization", "All pipeline steps must produce parseable JSON"));
        s.setChecksum(DigestUtils.sha256Hex(s.getContent().toString()));
        return s;
    }

    public static PebCapability capability(String entityId, String token) {
        var c = new PebCapability();
        c.setId(UUID.randomUUID());
        c.setEntityId(entityId);
        c.setCapability(token);
        c.setGrantedBy("system");
        c.setActive(true);
        return c;
    }

    public static ValidateTransitionRequest validTransitionRequest() {
        return new ValidateTransitionRequest(
            "agent-01", UUID.randomUUID().toString(),
            "NEW", "INTAKE"
        );
    }
}
```

---

## 12. Dependency Versions (POM)

```xml
<!-- Parent POM: peb-kernel/pom.xml -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.4.0</version>
</parent>

<properties>
    <java.version>21</java.version>
    <spring-boot.version>3.4.0</spring-boot.version>
    <flyway.version>10.20.0</flyway.version>
    <testcontainers.version>1.20.0</testcontainers.version>
    <jqwik.version>1.9.1</jqwik.version>
</properties>

<dependencies>
    <!-- Spring Boot -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-cache</artifactId>
    </dependency>

    <!-- Database -->
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>org.flywaydb</groupId>
        <artifactId>flyway-core</artifactId>
    </dependency>
    <dependency>
        <groupId>org.flywaydb</groupId>
        <artifactId>flyway-database-postgresql</artifactId>
    </dependency>

    <!-- Cache -->
    <dependency>
        <groupId>com.github.ben-manes.caffeine</groupId>
        <artifactId>caffeine</artifactId>
    </dependency>

    <!-- Jackson (JSONB support) -->
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
    </dependency>
    <dependency>
        <groupId>com.fasterxml.jackson.datatype</groupId>
        <artifactId>jackson-datatype-jsr310</artifactId>
    </dependency>
    <dependency>
        <groupId>io.hypersistence</groupId>
        <artifactId>hypersistence-utils-hibernate-63</artifactId>
        <version>3.8.3</version>
    </dependency>

    <!-- Testing -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>postgresql</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>junit-jupiter</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>net.jqwik</groupId>
        <artifactId>jqwik</artifactId>
        <version>${jqwik.version}</version>
        <scope>test</scope>
    </dependency>
</dependencies>
```

---

## 13. Phase 1 Scope Checklist

Everything in the build spec is Phase 1 unless explicitly marked otherwise.

| Component | Phase | Status in Spec |
|-----------|-------|----------------|
| PebState entity + repository | P1 | §2.1, §6.1 |
| PebDecision entity + repository | P1 | §2.2, §6.1 |
| PebTransaction entity + repository | P1 | §2.3, §6.1 |
| PebCapability entity + repository | P1 | §2.6, §6.1 |
| PebTrace entity + repository | **P3** | §2.4 (defined, not built in P1) |
| PebViolation entity + repository | **P4** | §2.5 (defined, not built in P1) |
| PebGovernanceEngine | P1 | §4.1 |
| AdmissionController | P1 | §4.2 |
| PebTransactionEngine | P1 | §4.3 |
| InvariantValidator | P1 | §4.4 |
| TransformValidator (stub) | P1 | §4.5 (stub only — full check in P3) |
| PebHashService | P1 | §5.1 |
| DocumentChecksumUpdater | P1 | §5.2 |
| LosmIrTransitionAdapter | P1 | §9.1 |
| Transition REST endpoint | P1 | §7.2 |
| Hash REST endpoint | P1 | §7.2 |
| State REST endpoint | P1 | §7.2 |
| Decision REST endpoint | **P2** | §7.2 (defined, not built in P1) |
| Trace REST endpoint | **P3** | §7.2 (defined, not built in P1) |
| Violation REST endpoint | **P4** | §7.2 (defined, not built in P1) |
| Flyway migration V1 | P1 | §6.2 |
| Unit tests | P1 | §11.2 |
| Integration tests | P1 | §11.2 |
| Conduit adapter | **P2** | §9.3 (stub in P1) |
| Nebula adapter | **P3** | §9.3 (stub in P1) |

---

## 14. Implementation Plan Template

When you hand this to engineers to create the Implementation Plan, the
expected output is a document that fills in:

1. **Story breakdown** — each major component becomes a Jira/ticket story
2. **Story dependencies** — which stories block which
3. **Estimate** — story points or engineer-days per story
4. **Acceptance criteria** — per story, from the test cases in §11.2
5. **Integration test scenarios** — end-to-end flows that exercise the
   full admission → transaction → hash chain
6. **Rollout sequence** — which stories go in which sprint

The ticket breakdown should follow the dependency graph:

```
Sprint 1:  Domain entities + Flyway schema (§2, §6)
Sprint 2:  PebHashService + DocumentChecksumUpdater (§5)
Sprint 3:  LosmIrTransitionAdapter + InvariantValidator (§9, §4.4)
Sprint 4:  AdmissionController + PebTransactionEngine (§4.2, §4.3)
Sprint 5:  PebGovernanceEngine + MCP facades + error handling (§4.1, §7)
Sprint 6:  Tests — unit + integration + hash property-based (§11)
```

The hash service must exist before the transaction engine (transactions need
hash to capture beforeHash). The transaction engine must exist before the
governance engine. The governance engine must exist before API facades.
Everything depends on the domain entities and schema.

---

## 15. Risks (Building-Specific)

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Jackson JSONB mapping** — Hibernate + PostgreSQL JSONB with Jackson | Wrong column type, deserialization errors | Use `@Type(JsonType.class)` from Hypersistence Utils; verify in integration test |
| **Idempotency key collisions** — two requests with same key but different payloads | Silent data corruption | `idempotency_key` is UNIQUE; second insert throws constraint violation — handle with try-catch + return existing |
| **Hash cache invalidation** — stale hash after peb_state change | Observers see wrong hash | `@CacheEvict` on PebStateRepository.save() + timeout fallback in PebHashService |
| **Optimistic lock on peb_state** — concurrent transactions touching same key | `OptimisticLockException` | `@Version` field; PebTransactionEngine catches and retries with backoff |
| **Flyway migration order** — columns added in wrong order | Migration fails | All Phase 1 migrations in V1; later phases as V2, V3, V4 |
| **losm-ir transition table divergence** — Java enum doesn't match Python losm_ir | Silent acceptance of illegal transitions | Single source of truth: the Java enum IS the table; Python losm_ir is a derived copy |
