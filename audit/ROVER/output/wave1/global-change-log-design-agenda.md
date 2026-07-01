# Harvested Specification & Code Repository

**Source:** `Global Change Log Design.html` (Bulk Export — Topology Self-Model content)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 5 Specification Candidates extracted

---

## 1. Nexus Topology Self-Model (TSM) v0.1
**Status:** `Agreed`

### Architectural Intent
Nexus should be able to tell us what it contains, what it uses what for, and what it thinks about its own topology. The TSM is a JSON-LD + TypeSpec hybrid schema that captures inventory, relationship, and interpretation layers in a graph-native format.

### Requirements & Acceptance Criteria
- [ ] JSON-LD context (`nexus-topology.context.jsonld`) defines the semantic graph vocabulary with namespaces, types, and property mappings
- [ ] TypeSpec (`nexus-topology.tsp`) is the authoritative schema contract layer
- [ ] Core types:
  - **TopologySnapshot** — frozen view of "what Nexus believes its topology is" at a moment in time. Contains entityCount, edgeCount, assertionCount, confidenceScore. Has scope (repos, branches, workRequests, harvestWindow)
  - **TopologyEntity** — a node in the topology graph. Fields: id, name, entityKind, identityStatus, topologyRole, description, systemAffinity, implementedBy, consumedVia, ownedContracts, runtimePlacement, tags
  - **TopologyEdge** — a typed relationship. Fields: id, from, to, relationshipType, strength, cardinality, semanticMeaning, activationConditions, evidenceRefs
  - **TopologyAssertion** — an interpretable claim about an entity or relationship. Fields: id, subject, predicate, object, assertionKind, scope, confidence, status (provisional|accepted|rejected), rationale, supportedBy, assertedBy, assertedAt
  - **TopologyEvidence** — a provenance-bearing observation. Fields: id, evidenceKind, capturedAt, sourceRef, summary, supports, confidence
  - **TopologyProjection** — reusable view definition over the graph. Fields: id, name, projectionKind, focusEntities, focusAssertions, derivedFromSnapshot
  - **TopologyPromotionDecision** — governance record for candidate→canonical promotion
- [ ] EntityKind enum: system, module, service, process, runtime, agent, tool, mcp, schema, ir, memory_substrate, capability_module, harness_feature, external_system, ui_surface, database, projection, snapshot
- [ ] RelationshipType enum: contains, part_of, depends_on, uses, invokes, reads_from, writes_to, persists_to, projects_to, derived_from, supersedes, bridges_to, optional_for, required_for, governed_by, exposed_via, mounted_into
- [ ] Three hard capabilities this enables: self-inventory (what exists, where it lives), self-interpretation (what is optional/constitutive), self-topology explanation (what uses what, what would break if removed)

### Harvested Code Artifacts
#### Purpose: Topology Self-Model core types
```typescript
// TypeSpec authoritative schema
namespace Nexus.Topology;

model TopologySnapshot {
  snapshotId: string;
  system: string;
  capturedAt: utcDateTime;
  scope: TopologyScope;
  entityCount: int32;
  edgeCount: int32;
  assertionCount: int32;
  confidenceScore: float32;
  entities: TopologyEntity[];
  edges: TopologyEdge[];
  assertions: TopologyAssertion[];
  evidence: TopologyEvidence[];
  projections?: TopologyProjection[];
  derivedFrom: string[];
}
```

#### Purpose: Entity model
```typescript
model TopologyEntity {
  id: string;
  name: string;
  entityKind: EntityKind;
  identityStatus: IdentityStatus;
  topologyRole?: string;
  description?: string;
  systemAffinity: string[];
  implementedBy?: string[];
  consumedVia?: string[];
  ownedContracts?: string[];
  runtimePlacement?: RuntimePlacement;
  tags?: string[];
}
```

### Unresolved Follow-Ups
- Where does the TSM live physically — PEB, Nebula, or a new service?
- Query layer: "show all optional capability modules and their dependencies"?

---

## 2. Three-Layer Self-Model Architecture v0.1
**Status:** `Agreed`

### Architectural Intent
The TSM separates three distinct layers: Structure (truth — entities and edges), Meaning (interpretation — assertions, identityStatus, topologyRole), and Evidence (epistemology — why we believe anything at all). This separation is what makes self-description work instead of becoming a static diagram.

### Requirements & Acceptance Criteria
- [ ] **Layer 1: Structure** — entities and edges. These are truth: what exists, what connects to what. Free from interpretation
- [ ] **Layer 2: Meaning** — assertions, identityStatus, topologyRole. These are interpretation: what a thing is for, whether it is core or optional. Not hard facts but claims with confidence
- [ ] **Layer 3: Evidence** — evidence records. These are epistemology: why we believe any assertion, where the observation came from, how confident we are
- [ ] Assertions must carry: assertionKind (classification, identity_boundary, dependency_interpretation, topology_claim, responsibility_claim, bridge_decision, deprecation_claim, uncertainty_claim), confidence (0-1), status (provisional|accepted|rejected)
- [ ] Evidence must carry: evidenceKind (repo_scan, import_graph, runtime_observation, config_observation, document_passage, transcript_quote, change_log_event, steward_annotation, manual_note)
- [ ] The separation prevents confusing "what is" with "what we think" — a core design principle

### Harvested Code Artifacts
#### Purpose: Three-layer separation
```
Layer 1: Structure     — entities, edges                 (truth)
Layer 2: Meaning       — assertions, identityStatus       (interpretation)
Layer 3: Evidence      — evidence records, provenance     (epistemology)
```

#### Purpose: Assertion model
```typescript
model TopologyAssertion {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  assertionKind: AssertionKind;
  scope: string;
  confidence: float32;
  status: string;  // provisional | accepted | rejected
  rationale?: string;
  supportedBy?: string[];
  assertedBy: string;
  assertedAt: utcDateTime;
}
```

### Unresolved Follow-Ups
- How to detect when an assertion's evidence becomes stale?
- What is the reconciliation process for conflicting assertions?

---

## 3. System Identity Status Enum v0.1
**Status:** `Agreed`

### Architectural Intent
A critical classification enum that lets Nexus answer "is this part of what Nexus is?" This prevents confusing "thing Nexus uses" with "thing Nexus is."

### Requirements & Acceptance Criteria
- [ ] `identityStatus` values:
  - **constitutive** — part of Nexus's core identity (Nexus runtime, Nebula, PEB, WRP, CIR, CER, CGEL)
  - **shared_substrate** — used by multiple systems but not owned by any single one (WRP, CIR/CER/CGEL contracts)
  - **optional** — enhances Nexus but does not define it (LOSM, Vision)
  - **external_dependency** — external tool or service Nexus depends on (GitHub, Ollama, OpenCode mode state)
  - **experimental** — not yet stable enough for classification
  - **legacy** — being phased out
  - **unknown** — not yet classified
- [ ] Examples:
  - PEB → constitutive
  - Nebula → constitutive
  - LOSM → optional
  - OpenCode → external_dependency (harness feature)
  - OpenCode role state → harness_feature, not project role

### Harvested Code Artifacts
#### Purpose: IdentityStatus enum
```typescript
enum IdentityStatus {
  constitutive,       // part of core identity
  shared_substrate,   // shared across systems
  optional,           // enhances but doesn't define
  external_dependency, // external tool/service
  experimental,       // not yet stable
  legacy,             // being phased out
  unknown,            // not yet classified
}
```

### Unresolved Follow-Ups
- How to handle components that change identityStatus over time (e.g., LOSM moving from constitutive to optional)?
- What is the workflow for upgrading from unknown → classified?

---

## 4. Promotion Governance Model v0.1
**Status:** `Agreed`

### Architectural Intent
Harvests propose, Steward/Nexus promotes, PEB holds the canonical assertion. A `TopologyPromotionDecision` record creates a clean governance seam between candidate topology facts and canonical self-model facts.

### Requirements & Acceptance Criteria
- [ ] Two-speed model:
  - **Speed 1 — Curated semantic topology**: small set of high-value TopologyEntity records (systems, memory substrates, IRs/contracts, major runtime components, capability modules, external/harness dependencies)
  - **Speed 2 — Harvested structural observations**: repo scans, import graphs, config discoveries, runtime observations that produce TopologyEvidence and candidate edges/assertions — do NOT automatically become canonical topology truth until promoted
- [ ] **TopologyPromotionDecision** records when something moves from "candidate topology fact" to "canonical self-model fact"
- [ ] Decision fields: candidateAssertion, decision (accepted|rejected|deferred), decidedBy, decidedAt, resultingAssertion, notes
- [ ] Seam: harvests propose → Steward/Nexus promotes → PEB holds the canonical assertion
- [ ] Implementation order:
  1. Curated seed inventory (20-30 entities manually)
  2. Small edge vocabulary (contains, uses, depends_on, persists_to, projects_to, optional_for, required_for, supersedes)
  3. Identity assertions per seeded entity
  4. Wire in evidence harvest (repo scans, docs, GCL, transcripts)
  5. Add snapshot generation and Nebula review projections

### Harvested Code Artifacts
#### Purpose: Promotion governance schema
```typescript
model TopologyPromotionDecision {
  id: string;
  candidateAssertion: string;
  decision: string;  // accepted | rejected | deferred
  decidedBy: string;
  decidedAt: utcDateTime;
  resultingAssertion?: string;
  notes?: string;
}
```

#### Purpose: Two-speed model
```
Speed 1 — Curated: 20-30 high-value entities, manually seeded
Speed 2 — Harvested: auto-discovered evidence, candidate only until promoted

Seam: harvests propose → Steward/Nexus promotes → PEB canonicalizes
```

### Unresolved Follow-Ups
- Who is the "Steward" that promotes — a human operator, an automated agent, or a governance process?
- How are conflicts resolved when harvested evidence contradicts curated assertions?

---

## 5. Assistance Core/Capability Module Boundary v0.1
**Status:** `Agreed`

### Architectural Intent
LOSM stops being part of the identity layer of Nexus/Assistance and becomes part of the capability layer. Assistance defines a contract for semantic execution augmentation, and LOSM is one implementation of that contract. This prevents LOSM from becoming a mandatory dependency of the whole system.

### Requirements & Acceptance Criteria
- [ ] **Identity-defining components (Assistance Core)**: shared semantic contracts, base runtime/orchestration/governance substrate, PGV/durable project-governance memory layer, minimal execution spine. Without these, it is not Assistance
- [ ] **Optional capability modules**: LOSM, Vision, future planner/analysis accelerators. These enhance Assistance but do not define it
- [ ] Assistance tiers:
  - **Assistance Core**: orchestration, role/governance/runtime, shared IR/contracts, durable memory/governance substrate
  - **Assistance + LOSM**: richer semantic execution, graph morphism, lifecycle intelligence
  - **Assistance + Vision**: multimodal/visual/perception-specific capabilities
  - **Assistance + LOSM + Vision**: the full loaded build
- [ ] Principle: "LOSM and Vision are not constitutive parts of Assistance. They are optional capability modules that Assistance can mount through stable process contracts."
- [ ] For Nexus: "Nexus may host or consume LOSM, but LOSM is no longer treated as part of Nexus's defining architecture."

### Harvested Code Artifacts
#### Purpose: Core vs capability boundary
```
Assistance Core (identity-defining):
  - shared semantic contracts (CIR, CER, CGEL, WRP)
  - base runtime/orchestration/governance
  - PGV / durable project-governance memory
  - minimal execution spine

Optional Capability Modules:
  - LOSM (semantic execution engine)
  - Vision (multimodal perception)
```

#### Purpose: Assistance deployment tiers
```
Assistance Core                        — minimal viable system
Assistance + LOSM                      — richer semantic execution
Assistance + Vision                    — multimodal capabilities
Assistance + LOSM + Vision             — full build
```

### Unresolved Follow-Ups
- Does LOSM need to be extracted into its own standalone service with its own lifecycle before it can be truly optional?
- What are the "stable process contracts" that Core uses to mount capability modules?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | Nexus Topology Self-Model (TSM) | Agreed | JSON-LD + TypeSpec, 7 core types, self-inventory/interpretation |
| 2 | Three-Layer Self-Model Architecture | Agreed | Structure/Meaning/Evidence separation |
| 3 | System Identity Status Enum | Agreed | constitutive/optional/external/experimental/legacy |
| 4 | Promotion Governance Model | Agreed | Two-speed, harvest→promote→canonicalize, TopologyPromotionDecision |
| 5 | Assistance Core/Capability Boundary | Agreed | LOSM as optional module, 4 deployment tiers |

---

*Extracted from `chats/Global Change Log Design.html`, 47 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
