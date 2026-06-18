>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Execution Context (Current Run)

This document is the explicit execution trace. It is immutable during the run and fully replayable afterward. It operates strictly outside of the Long-Term PEB and Short-Term Thought Context.

## State Snapshot
- `PEB_STATE_HASH`: [To be injected]
- `THOUGHT_CONTEXT_HASH`: [To be injected]

## Causal Trace DAG

```yaml
RUN_SEGMENT:
  id: init_0
  parent_segment_id: null
  stage: system_initialization
  inputs: []
  causal_entries: [CEGL-A rollout authorized]
  rejected_alternatives: []

RUN_SEGMENT:
  id: cegla_day0
  parent_segment_id: init_0
  stage: governance_bootstrap
  inputs:
    - type: git_commit
      repo: go/wrp/ccnf-ref (submodule)
      commit: c16d06d
      message: "chore(cegl): declare CEGL-A rollout start"
  causal_entries:
    - Empty baseline commit, no functional changes
    - Anchors pre-constitutional baseline
    - Prevents retroactive interpretation of earlier commits
  rejected_alternatives: []

RUN_SEGMENT:
  id: cegla_rollout
  parent_segment_id: cegla_day0
  stage: governance_implementation
  inputs:
    - type: git_commit
      repo: go/wrp/ccnf-ref (submodule)
      commit: 09857db
      message: "feat(cegl): implement CEGL-A closed-world verification"
    - type: git_commit
      repo: nexus (parent)
      commit: 2fd118b
      message: "feat(cegl): implement CEGL-A closed-world verification (submodule)"
  causal_entries:
    - Phase 1: .tools/transition_ledger.json — canonical (S, T, I, E) specification
    - Phase 2: scripts/compile-cegla-state.sh — deterministic state compiler C: O → S
    - Phase 3: Gate 4A in check-adr001.sh — pgv.phase write protection (compiled_only)
    - Phase 4: scripts/check-cegla.sh — verification engine, transition legality + invariant check
    - Phase 5: R10.5 wired into Makefile (31/31), CI job r10-5-cegla-verification
    - State: PHASE_2_FROZEN — EVOLUTION LEGAL (verified)
    - PGV hash e60ec6a... unchanged
    - All 9 Go test packages pass
  rejected_alternatives:
    - Including Transition Commit Primitive in Phase 1-5 (rejected: would couple verification + mutation + authority)

RUN_SEGMENT:
  id: rust_mirrors
  parent_segment_id: cegla_rollout
  stage: implementation
  inputs:
    - type: git_commit
      repo: nexus (parent)
      commit: 334b558
      message: "feat(rust): implement runtime trace, replay, rehydrate, and projection mirrors"
  causal_entries:
    - runtime/trace.rs: passive append-only TraceBuilder with domain-separated RootHash
    - runtime/replay/: sealed ABI fold engine, cursor, types, validate (5 files, 385 lines)
    - runtime/rehydrate/: decode, reader, registry, scan, snapshot, view (8 files, 91 lines)
    - projection/account/: AccountProjection with unexported cache, rebuild determinism
    - Extension of ExecutionReceipt with trace_root_hash, replay_binding_hash
    - 48 Rust tests pass (build clean)
  rejected_alternatives: []
```

## Current State
- **Mode:** execute (legacy — WorkRequest pipeline not active)
- **Governance:** CEGL-A verified — PHASE_2_FROZEN
- **Active ADRs:** ADR-001 through ADR-00Z (5 ADRs, committed)
- **CI:** R6 31/31 phases, PGV hash e60ec6a..., CEGL-A verification passing
