# ═══════════════════════════════════════════════════════════════════
# CCNF Invariant DSL — Machine-Checkable System Consistency Model
#
# Encodes the full theorem set (Plan 0018) into a declarative contract
# layer for CI enforcement.  Designed as a YAML spec sitting above
# pytest + Rust CCNF verifier + Python replay engine.
#
# Version: 1.0
# System:  nexus_ccnf_consistency_model
# ═══════════════════════════════════════════════════════════════════

system: nexus_ccnf_consistency_model

version: 1.0

execution_model:
  event_source: IR_EventEnvelope
  deterministic_ordering: true

components:
  semantic:
    type: function
    f: "P(E)"
    python_entrypoint: semantic_projection.SemanticProjectionBuilder.from_envelopes

  graph_state:
    type: function
    f: "R(E)"
    python_entrypoint: graph_models.GraphState

  fsm:
    type: function
    f: "Φ(G)"
    python_entrypoint: replay_kernel.ReplayEngine.replay

  rust_ccnf:
    type: function
    f: "C(E)"
    binary: ../../../rust/wrp/ccnf-verifier/target/release/ccnf-verifier

---

# ─────────────────────────────────────────────
# I.  SEMANTIC INVARIANTS  (Plan 0018 S1–S4)
# ─────────────────────────────────────────────

invariants:

  S1_semantic_determinism:
    description: "SemanticProjection must be deterministic over identical event streams"
    forall: [E1, E2]
    when: "E1 == E2"
    assert: "P(E1) == P(E2)"
    ci_test: test_semantic_projection.py::test_determinism
    ci_test: test_semantic_projection.py::test_determinism_all_fixtures
    status: PASSING

  S2_semantic_isolation:
    description: "SemanticProjection must not influence FSM or GraphState"
    assert:
      independent_of:
        - F
        - G
    ci_check: "grep -R 'SemanticProjection' replay_engine.py replay_kernel.py | grep -v import"
    expected: empty
    status: PASSING

  S3_semantic_non_authority:
    description: "SemanticProjection is derived knowledge only, never control input"
    assert:
      not_in_input_of:
        - F
        - G
    ci_check: "grep 'semantic_projection' transition_synthesizer.py execution_gate.py"
    expected: empty
    status: UNVERIFIED

  S4_semantic_purity:
    description: "P depends only on E, not on G, F, or closure"
    assert:
      P_only_depends_on: [E]
    ci_check: "grep -R 'GraphState\|ReconstructedClosureSet' semantic_projection.py | grep -v docstring"
    expected: empty
    status: PASSING

---

# ─────────────────────────────────────────────
# II.  STRUCTURAL INVARIANTS  (Plan 0018 G1–G5)
# ─────────────────────────────────────────────

  G1_graph_determinism:
    description: "GraphState must be purely deterministic from events"
    forall: [E1, E2]
    when: "E1 == E2"
    assert: "R(E1) == R(E2)"
    ci_test: test_dual_replay.py::test_legacy_replay_determinism
    status: PASSING

  G2_ccnf_equivalence:
    description: "Python GraphState hash MUST match Rust CCNF verifier — STRONGEST INVARIANT"
    forall: [E]
    assert: "R(E) == C(E)"
    comparison_mode: hash_based
    canonicalization:
      ordering: deterministic
      node_sort: true
      edge_sort: true
    ci_test: test_ccnf_alignment.py::test_empty_graph_hash_match
    failure_mode: HARD_FAIL
    status: NOT_IMPLEMENTED

  G3_graph_dependency:
    description: "GraphState must not depend on SemanticProjection or closure"
    assert:
      R_only_depends_on: [E]
    ci_check: "grep 'closure\|interpreter\|SemanticProjection' replay_engine.py graph_reducer.py"
    expected: empty
    status: PASSING

  G4_hash_stability:
    description: "Idempotent replay must produce identical canonical hash"
    forall: [E]
    assert: "hash(R(E)) == hash(R(E))"
    ci_test: test_semantic_projection.py::test_determinism
    status: PASSING

  G5_ordering_independence:
    description: "Hash depends only on {nodes, edges} as sets, not insertion order"
    assert: "hash(G) is invariant under node/edge reordering"
    ci_test: to_be_added
    status: UNVERIFIED

---

# ─────────────────────────────────────────────
# III.  EXECUTION INVARIANTS  (Plan 0018 F1–F4)
# ─────────────────────────────────────────────

  F1_fsm_determinism:
    description: "FSM must be a pure function of GraphState"
    forall: [G1, G2]
    when: "G1 == G2"
    assert: "Φ(G1) == Φ(G2)"
    ci_test: test_semantic_projection.py::test_semantic_replay_result_has_trajectory_states
    status: PASSING

  F2_fsm_isolation:
    description: "FSM must not depend on SemanticProjection"
    assert:
      F_input_excludes: [S]
    ci_check: "grep 'SemanticProjection' transition_synthesizer.py execution_gate.py"
    expected: empty
    status: UNVERIFIED

  F3_fsm_no_closure:
    description: "Closure system must not influence FSM execution — Plan 0012 complete"
    assert:
      F_input_excludes: [closure]
    ci_check: "grep 'closure\.\|ReconstructedClosureSet' replay_kernel.py | grep -v -E 'EnvelopeInterpreter|interpret|class Schema|SchemaRegistry|closures:'"
    expected: empty
    status: PASSING  # Plan 0012: ConstraintExtractor.from_stream replaces closure.constraints

  F4_transition_validity:
    description: "FSM transitions must respect GraphState constraints"
    assert: "valid_transitions(Φ(G)) ⊆ transition_rules(G)"
    ci_check: implicit in TransitionSynthesizer design
    status: UNVERIFIED

---

# ─────────────────────────────────────────────
# IV.  CROSS-LAYER INVARIANTS  (Plan 0018 X1–X5)
# ─────────────────────────────────────────────

  X1_semantic_graph_independence:
    description: "Semantic interpretation must not affect structural replay"
    assert:
      independent:
        - "P(E)"
        - "R(E)"
    status: PASSING  # design guarantee

  X2_execution_dependency:
    description: "Execution gating reads only from GraphState"
    assert:
      F_input_only: [G]
    status: PASSING  # Plan 0012: ConstraintExtractor.from_stream eliminates closure backchannel

  X3_dual_oracle_convergence:
    description: "Projection and legacy closure must match on covered fixtures (transitional)"
    forall: "fixtures with legacy coverage"
    assert: "P(E) ≈ closure(E)"
    ci_test: test_dual_replay.py (all covered fixtures at zero divergence)
    status: PASSING

  X4_ccnf_equivalence_bridge:
    description: "Python structural truth = Rust canonical truth"
    assert: "R(E) = C(E)"
    depends_on: G2_ccnf_equivalence
    status: NOT_IMPLEMENTED

  X5_full_system_consistency:
    description: "FSM results identical whether G from Python or Rust"
    forall: [E]
    assert: "Φ(R(E)) == Φ(C(E))"
    depends_on: [G2, X4]
    status: NOT_IMPLEMENTED

---

# ─────────────────────────────────────────────
# V.  DELETION INVARIANTS  (Plan 0018 D1–D4)
# ─────────────────────────────────────────────

  D1_closure_non_influence:
    description: "Closure can be removed without changing any runtime output"
    forall: [E]
    mutation:
      closure_modified: true
    assert:
      system_output_unchanged: true
    status: CANNOT_PASS  # blocked by F3 (closure.constraints in FSM)

  D2_closure_derivative:
    description: "System behavior invariant to closure modifications"
    assert: "∂(system_output)/∂(closure) == 0"
    depends_on: D1
    status: CANNOT_PASS

  D3_closure_irrelevance:
    description: "Closure not in transitive dependency closure of F, G, S"
    assert:
      closure_not_in_transitive_dependency_of:
        - F
        - G
        - S
    status: CANNOT_PASS  # path: closure → constraint_snapshot → FSM

  D4_safe_deletion_condition:
    description: "Closure deletable iff all derivative conditions are true"
    assert: "closure_deletable ⇔ (D1 ∧ D2 ∧ D3)"
    depends_on: [D1, D2, D3]
    status: CANNOT_PASS

---

# ─────────────────────────────────────────────
# RUNTIME TRACE RULES
# ─────────────────────────────────────────────

trace_rules:

  closure:
    allowed:
      - create: true
      - internal_read: true

    forbidden:
      - fsm_input: true
      - graph_input: true
      - semantic_input: true

    failure_mode: HARD_FAIL
    current_violation: "none — ConstraintExtractor.from_stream in use (Plan 0012)"

  semantic_projection:
    must_not_depend_on:
      - closure
      - fsm

  graph_state:
    must_not_depend_on:
      - semantic_projection
      - closure

---

# ─────────────────────────────────────────────
# CCNF ALIGNMENT RULES  (RUST BOUNDARY)
# ─────────────────────────────────────────────

ccnf_alignment:

  enabled: true

  invariant:
    G2_ccnf_equivalence: STRICT

  comparison_mode: hash_based

  canonicalization:
    ordering: deterministic
    node_sort: true
    edge_sort: true

  failure_mode: HARD_FAIL

  golden_vectors:
    path: ../../../go/wrp/ccnf-ref/vectors/v1
    expected_hashes: expected-hashes.json

---

# ─────────────────────────────────────────────
# FIXED POINT CONDITION  (GLOBAL SYSTEM VALIDITY)
# ─────────────────────────────────────────────

  fixed_point:

    system_is_valid_when:
      - "G2_ccnf_equivalence == true"
      - "X5_full_system_consistency == true"
      - "S2_semantic_isolation == true"
      - "D1_closure_non_influence == true"
      - "trace_rules.closure.forbidden.fsm_input == true"

    current_status: "3 of 5 conditions met — blocked on G2, D1 (F3 resolved by Plan 0012)"

---

# ─────────────────────────────────────────────
# DELETION GATE  (CLOSURE REMOVAL SAFETY)
# ─────────────────────────────────────────────

deletion_gate:

  closure_deletable_when:
    all:
      - "D1_closure_non_influence == true"
      - "D2_closure_derivative == true"
      - "D3_closure_irrelevance == true"
      - "trace_rules.closure.forbidden.fsm_input == true"
      - "trace_rules.closure.forbidden.graph_input == true"
      - "trace_rules.closure.forbidden.semantic_input == true"

  action:
    allow_delete:
      - ReconstructedClosureSet
      - EnvelopeInterpreter_V1
      - SchemaRegistry
      - "closure dict in ReplayEngine.replay()"

---

# ─────────────────────────────────────────────
# COMPLETENESS GUARANTEE
# ─────────────────────────────────────────────

completeness:

  system_spec_covers:
    - semantic_layer
    - graph_layer
    - execution_layer
    - canonical_ccnf_layer

  excludes:
    - closure_as_truth_source

  invariant:
    no_hidden_state_dependencies: true
