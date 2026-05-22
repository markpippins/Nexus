# Decision Log

This append-only document tracks ADRs (Architectural Decision Records) and historical changes.

## Initial Setup
- Transitioned PEB to a Cognitive Runtime to allow for structured interpretation, learning, and self-evolution.

---

## Governance ADRs (go/wrp/ccnf-ref)

These ADRs were authored in the CCNF reference implementation and govern the identity, entropy, and accountability layers.

### ADR-001 — IR Identity Governance & Controlled Change Protocol
- **Date:** 2026-05-19
- **Status:** Accepted — Phase 2 Freeze Active
- **Summary:** Frozen IR Projection Contract. Defines three phases (Frozen/Dual/Switch), a 5-step Controlled Change Protocol (Intent → Dual Implementation → Dual Run Validation → Explicit Rebaseline → Contract Lock), and the IR identity surface protected by CI guardrails (3 gates). Establishes that structural behavior affecting IR identity MUST NOT change without governance protocol.
- **Commit:** `1e5b3ba`

### ADR-002 — StableID Introduction & Identity Normalization
- **Date:** 2026-05-19
- **Status:** Draft — Phase 3 Intent Declaration
- **Summary:** StableID = HASH(OriginSeed + SemanticSignature). OriginSeed = UUIDv7 assigned write-once at first registry insertion. SemanticSignature = Name + sorted(DirectDeps), computed by ToIR (pure). Three invariants: Immutability (never changes once observed), Determinism (identical inputs → identical StableIDs), Lineage Preservation (MOVE/MERGE/SPLIT preserve ancestry graph). 6 CI guardrails enforce the identity subsystem.
- **Commit:** `b38fec7`

### ADR-003 — Minimal Entropy Identity Normalization (MEIN)
- **Date:** 2026-05-19
- **Status:** Draft — Entropy Collapser
- **Entropy Class:** Collapser (Strong)
- **Summary:** Three entropy-collapse laws: SSV1 (SemanticSignature immutably versioned, never reinterpreted), ISPL1 (Identity overrides structure after normalization gate), ROD1 (Registry ordering = commit causal order, not arrival time). Identity (I) domain permanently sealed — no entropy injection allowed. Establishes that versioning produces forked identity (StableID_v2), not silent recomputation.
- **Commit:** `858c06e`

### ADR-004 — Controlled Entropy Sovereignty (CES)
- **Date:** 2026-05-19
- **Status:** Draft — Sovereignty Layer
- **Entropy Class:** Shaper (strong regulatory component)
- **Summary:** Sovereign Actor Model defining who may inject entropy into the system: only System, ADR-authorized Agents, and Governance Kernel. Entropy injection types are classified into Topology (T), Content (C), and Registry (R) — Identity (I) is permanently forbidden. Introduces Entropy Budget Allocation Authority (EBAA) and Entropy Flow Graph (EFG v2) for tracking entropy across domains and phases.
- **Commit:** `3fd1307`

### ADR-00Z — Policy Trace Overlay — Causal Entropy Ledger
- **Date:** 2026-05-19
- **Status:** Draft — Accountability Layer
- **Entropy Class:** Shaper (zero net ΔH — records, does not inject)
- **Summary:** Append-only EntropyEvent primitive forming a Causal Entropy Graph (CEG) layered on the EFG. Sovereignty Trace binds actor, authority source, budget source, and justification hash to every entropy transformation. The Entropy Accountability Law states: no entropy may exist without an originating EntropyEvent chain. Completes the Collapse → Control → Accountability triad.
- **Commit:** `64b2d94`

---

## CEGL-A Rollout

### CEGL-A Day 0 — Baseline Declaration
- **Date:** 2026-05-19
- **Commit:** `c16d06d` (submodule)
- **Summary:** Declared CEGL-A rollout start with an empty baseline commit. Establishes a pre-constitutional anchor preventing retroactive interpretation of earlier commits.

### CEGL-A Closed-World Verification
- **Date:** 2026-05-19
- **Commit:** `09857db` (submodule), `2fd118b` (parent)
- **Summary:** Implemented CEGL-A closed-world verification = (S, T, I, E) — governance states, transitions, invariants, and entropy cost. Axiom A3 enforces |C(O)| = 1 (unique canonical state). Five phases: transition ledger (`.tools/transition_ledger.json`), state compiler (`compile-cegla-state.sh`), Gate 4A write protection, verification engine (`check-cegla.sh`), R10.5 CI job (31/31 phases). Transition Commit Primitive deferred to Phase 6 post-stabilization.
