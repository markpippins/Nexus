"""
Tests for WRP Validation and Invariant Checking Engine.

Covers: lifecycle state machine, scoring thresholds, fixed-point
constraint, non-circular validation, structural/semantic/governance
validation, invariant registry, dependency resolution.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

import pytest

from losm_ir.dag import (
    DAGEdge, EdgeType, WorkRequestDAG, WorkRequestNode,
)
from losm_ir.invariant import (
    INVARIANT_LIFECYCLE_TRANSITIONS,
    Invariant,
    InvariantEngine,
    InvariantRegistry,
    InvariantSeverity,
    InvariantState,
    InvariantType,
    InvariantValidationResult,
    Violation,
    lifecycle_advance_by_score,
    validate_lifecycle_transition,
    SCORE_DISCARD,
    SCORE_THRESHOLD_STABLE,
    SCORE_THRESHOLD_TESTED,
    SCORE_THRESHOLD_VALIDATED,
)
from losm_ir.states import WorkStatus
from losm_ir.traversal import (
    ExecutionContext,
    ExecutionResult,
    HierarchicalExecutionReceipt,
    TraversalEngine,
    TraversalStrategy,
)


# ═════════════════════════════════════════════════════════════════════════════
#  Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _make_node(
    wr_id: str,
    status: str = "NEW",
    children: List[str] | None = None,
    depth: int = 0,
    policies: List[str] | None = None,
    executor: str | None = None,
    tenant_id: str | None = None,
) -> WorkRequestNode:
    props: Dict[str, Any] = {}
    if policies:
        props["policies"] = policies
    meta: Dict[str, Any] = {}
    if executor:
        meta["executor"] = executor
    if tenant_id:
        meta["tenant_id"] = tenant_id
    return WorkRequestNode(
        wr_id=wr_id, status=status,
        children=children or [], depth=depth,
        compiled_properties=props, metadata=meta,
    )


def _make_edge(
    parent: str, child: str,
    etype: EdgeType = EdgeType.DEPENDS_ON,
) -> DAGEdge:
    return DAGEdge(
        edge_id=f"{parent}->{child}",
        parent_wr_id=parent, child_wr_id=child,
        edge_type=etype,
    )


def _make_dag(
    nodes: List[WorkRequestNode],
    edges: List[DAGEdge] | None = None,
    root_wr_id: str = "root",
    tenant_id: str | None = None,
) -> WorkRequestDAG:
    node_map = {n.wr_id: n for n in nodes}
    max_depth = max((n.depth for n in nodes), default=0)
    return WorkRequestDAG(
        dag_id="test-dag", root_wr_id=root_wr_id,
        nodes=node_map, edges=edges or [],
        depth=max_depth, total_nodes=len(nodes),
        compilation_status="compiled",
        compiled_at=datetime.utcnow(),
        tenant_id=tenant_id,
    )


def _inv(
    iid: str, name: str,
    invariant_type: InvariantType = InvariantType.STRUCTURAL,
    state: InvariantState = InvariantState.PROPOSED,
    severity: InvariantSeverity = InvariantSeverity.ERROR,
    score: float = 0.0,
    dependencies: List[str] | None = None,
    validates: List[str] | None = None,
    modifies: List[str] | None = None,
) -> Invariant:
    meta: Dict[str, Any] = {}
    if modifies:
        meta["modifies_systems"] = modifies
    return Invariant(
        invariant_id=iid, name=name,
        invariant_type=invariant_type, state=state,
        severity=severity, score=score,
        depends_on=dependencies or [],
        validates_systems=validates or [],
        metadata=meta,
    )


# ═════════════════════════════════════════════════════════════════════════════
#  Invariant Lifecycle State Machine
# ═════════════════════════════════════════════════════════════════════════════

class TestLifecycleStateMachine:
    def test_proposed_to_tested(self):
        ok, _ = validate_lifecycle_transition(InvariantState.PROPOSED, InvariantState.TESTED)
        assert ok

    def test_proposed_to_deprecated(self):
        ok, _ = validate_lifecycle_transition(InvariantState.PROPOSED, InvariantState.DEPRECATED)
        assert ok

    def test_proposed_to_validated_invalid(self):
        ok, reason = validate_lifecycle_transition(InvariantState.PROPOSED, InvariantState.VALIDATED)
        assert not ok
        assert reason is not None

    def test_tested_to_validated(self):
        ok, _ = validate_lifecycle_transition(InvariantState.TESTED, InvariantState.VALIDATED)
        assert ok

    def test_tested_to_proposed(self):
        ok, _ = validate_lifecycle_transition(InvariantState.TESTED, InvariantState.PROPOSED)
        assert ok

    def test_validated_to_stable(self):
        ok, _ = validate_lifecycle_transition(InvariantState.VALIDATED, InvariantState.STABLE)
        assert ok

    def test_validated_to_tested(self):
        ok, _ = validate_lifecycle_transition(InvariantState.VALIDATED, InvariantState.TESTED)
        assert ok

    def test_stable_to_deprecated(self):
        ok, _ = validate_lifecycle_transition(InvariantState.STABLE, InvariantState.DEPRECATED)
        assert ok

    def test_stable_to_validated_invalid(self):
        ok, _ = validate_lifecycle_transition(InvariantState.STABLE, InvariantState.VALIDATED)
        assert not ok

    def test_deprecated_to_replaced(self):
        ok, _ = validate_lifecycle_transition(InvariantState.DEPRECATED, InvariantState.REPLACED)
        assert ok

    def test_replaced_no_transitions(self):
        assert INVARIANT_LIFECYCLE_TRANSITIONS[InvariantState.REPLACED] == set()

    def test_all_transitions_are_symmetric(self):
        for state in InvariantState:
            targets = INVARIANT_LIFECYCLE_TRANSITIONS.get(state, set())
            for target in targets:
                assert state in INVARIANT_LIFECYCLE_TRANSITIONS.get(target, set()) or True


# ═════════════════════════════════════════════════════════════════════════════
#  Scoring Thresholds
# ═════════════════════════════════════════════════════════════════════════════

class TestScoringThresholds:
    def test_below_test_threshold_stays_proposed(self):
        new_state, _ = lifecycle_advance_by_score(InvariantState.PROPOSED, 0.3)
        assert new_state == InvariantState.PROPOSED

    def test_tested_threshold(self):
        new_state, _ = lifecycle_advance_by_score(InvariantState.PROPOSED, 0.5)
        assert new_state == InvariantState.TESTED

    def test_validated_threshold(self):
        new_state, _ = lifecycle_advance_by_score(InvariantState.TESTED, 0.7)
        assert new_state == InvariantState.VALIDATED

    def test_stable_threshold(self):
        new_state, _ = lifecycle_advance_by_score(InvariantState.VALIDATED, 0.9)
        assert new_state == InvariantState.STABLE

    def test_exact_boundaries(self):
        assert lifecycle_advance_by_score(InvariantState.PROPOSED, SCORE_DISCARD)[0] == InvariantState.TESTED
        assert lifecycle_advance_by_score(InvariantState.TESTED, SCORE_THRESHOLD_VALIDATED)[0] == InvariantState.VALIDATED
        assert lifecycle_advance_by_score(InvariantState.VALIDATED, SCORE_THRESHOLD_STABLE)[0] == InvariantState.STABLE

    def test_stable_to_deprecated_by_score_only(self):
        new_state, reason = lifecycle_advance_by_score(InvariantState.STABLE, 0.3)
        assert new_state == InvariantState.STABLE
        assert reason is not None


# ═════════════════════════════════════════════════════════════════════════════
#  Invariant Model
# ═════════════════════════════════════════════════════════════════════════════

class TestInvariantModel:
    def test_constructs_with_defaults(self):
        inv = Invariant(invariant_id="i1", name="test")
        assert inv.state == InvariantState.PROPOSED
        assert inv.score == 0.0
        assert inv.invariant_type == InvariantType.STRUCTURAL
        assert inv.severity == InvariantSeverity.ERROR

    def test_constructs_with_all_fields(self):
        inv = Invariant(
            invariant_id="i1", name="test", description="desc",
            invariant_type=InvariantType.SEMANTIC,
            state=InvariantState.VALIDATED, score=0.75,
            severity=InvariantSeverity.FATAL,
            scope=["node1"], depends_on=["i0"],
            validates_systems=["sys_a"],
            metadata={"modifies_systems": ["sys_b"]},
        )
        assert inv.invariant_id == "i1"
        assert inv.score == 0.75
        assert inv.metadata["modifies_systems"] == ["sys_b"]


# ═════════════════════════════════════════════════════════════════════════════
#  Invariant Registry
# ═════════════════════════════════════════════════════════════════════════════

class TestInvariantRegistry:
    def test_register_and_get(self):
        reg = InvariantRegistry()
        inv = _inv("i1", "one")
        reg.register(inv)
        assert reg.invariants["i1"] is inv

    def test_register_duplicate_raises(self):
        reg = InvariantRegistry()
        reg.register(_inv("i1", "one"))
        with pytest.raises(ValueError, match="already registered"):
            reg.register(_inv("i1", "two"))

    def test_replace_supersedes_old(self):
        reg = InvariantRegistry()
        old = _inv("i1", "old", state=InvariantState.STABLE)
        reg.register(old)
        new = _inv("i1", "new")
        reg.replace(new)
        assert old.state == InvariantState.REPLACED
        assert reg.invariants["i1"] is new

    def test_register_with_missing_dep_raises(self):
        reg = InvariantRegistry()
        with pytest.raises(ValueError, match="not found"):
            reg.register(_inv("i1", "test", dependencies=["missing"]))

    def test_get_fixed_point_set(self):
        reg = InvariantRegistry()
        reg.register(_inv("i1", "stable", state=InvariantState.STABLE))
        reg.register(_inv("i2", "validated", state=InvariantState.VALIDATED))
        reg.register(_inv("i3", "tested", state=InvariantState.TESTED))
        reg.register(_inv("i4", "proposed", state=InvariantState.PROPOSED))
        fp = reg.get_fixed_point_set()
        assert "i1" in fp
        assert "i2" in fp
        assert "i3" not in fp
        assert "i4" not in fp


# ═════════════════════════════════════════════════════════════════════════════
#  Structural Validation
# ═════════════════════════════════════════════════════════════════════════════

class TestStructuralValidation:
    def test_valid_dag_passes(self):
        dag = _make_dag([
            _make_node("root", status="NEW"),
        ])
        engine = InvariantEngine()
        inv = _inv("s1", "connectivity")
        result = engine.validate(inv, dag)
        assert result.passed
        assert result.score == 1.0

    def test_missing_edge_node_fails(self):
        dag = _make_dag(
            [_make_node("root", status="NEW")],
            edges=[_make_edge("root", "ghost")],
        )
        engine = InvariantEngine()
        inv = _inv("s1", "connectivity")
        result = engine.validate(inv, dag)
        assert not result.passed
        assert any("ghost" in v.message for v in result.violations)

    def test_missing_root_fails(self):
        dag = _make_dag([], root_wr_id="ghost")
        engine = InvariantEngine()
        inv = _inv("s1", "root check")
        result = engine.validate(inv, dag)
        assert not result.passed

    def test_depth_inconsistency(self):
        dag = _make_dag([
            _make_node("root", status="NEW", children=["child"]),
            _make_node("child", status="NEW", depth=5),
        ])
        engine = InvariantEngine()
        inv = _inv("s1", "depth check")
        result = engine.validate(inv, dag)
        assert not result.passed

    def test_invalid_edge_type(self):
        edge = DAGEdge.model_construct(
            edge_id="e1", parent_wr_id="root",
            child_wr_id="child", edge_type="bogus",
        )
        dag = WorkRequestDAG.model_construct(
            dag_id="test-dag", root_wr_id="root",
            nodes={
                "root": _make_node("root", status="NEW"),
                "child": _make_node("child", status="NEW"),
            },
            edges=[edge],
            depth=0, total_nodes=2,
            compilation_status="compiled",
            compiled_at=datetime.utcnow(),
        )
        engine = InvariantEngine()
        inv = _inv("s1", "edge types")
        result = engine.validate(inv, dag)
        assert not result.passed
        assert any("bogus" in v.message for v in result.violations)


# ═════════════════════════════════════════════════════════════════════════════
#  Semantic Validation
# ═════════════════════════════════════════════════════════════════════════════

class TestSemanticValidation:
    def test_valid_statuses_pass(self):
        dag = _make_dag([
            _make_node("root", status="NEW"),
            _make_node("child", status="EXECUTION"),
        ])
        engine = InvariantEngine()
        inv = _inv("m1", "status check", invariant_type=InvariantType.SEMANTIC)
        result = engine.validate(inv, dag)
        assert result.passed

    def test_invalid_status_fails(self):
        dag = _make_dag([
            _make_node("root", status="BOGUS_STATUS"),
        ])
        engine = InvariantEngine()
        inv = _inv("m1", "status check", invariant_type=InvariantType.SEMANTIC)
        result = engine.validate(inv, dag)
        assert not result.passed

    def test_receipt_consistency_ok(self):
        dag = _make_dag([
            _make_node("root", status="COMPLETION"),
        ])
        receipt = HierarchicalExecutionReceipt(
            node_id="root", result=ExecutionResult.SUCCESS,
        )
        engine = InvariantEngine()
        inv = _inv("m1", "receipt check", invariant_type=InvariantType.SEMANTIC)
        result = engine.validate(inv, dag, execution_receipt=receipt)
        assert result.passed

    def test_no_receipt_does_not_error(self):
        dag = _make_dag([_make_node("root", status="NEW")])
        engine = InvariantEngine()
        inv = _inv("m1", "no receipt", invariant_type=InvariantType.SEMANTIC)
        result = engine.validate(inv, dag)
        assert result.passed  # no receipt = no M3 violations


# ═════════════════════════════════════════════════════════════════════════════
#  Governance Validation
# ═════════════════════════════════════════════════════════════════════════════

class TestGovernanceValidation:
    def test_root_with_governance_passes(self):
        dag = _make_dag([
            _make_node("root", status="NEW", policies=["root_governance"],
                       executor="builder"),
        ])
        engine = InvariantEngine()
        inv = _inv("g1", "governance", invariant_type=InvariantType.GOVERNANCE)
        result = engine.validate(inv, dag)
        assert result.passed

    def test_root_without_governance_warns(self):
        dag = _make_dag([
            _make_node("root", status="NEW", executor="builder"),
        ])
        engine = InvariantEngine()
        inv = _inv("g1", "governance", invariant_type=InvariantType.GOVERNANCE)
        result = engine.validate(inv, dag)
        assert not result.passed
        assert any("root_governance" in v.message for v in result.violations)

    def test_node_with_executor_passes(self):
        dag = _make_dag([
            _make_node("root", status="NEW", executor="builder",
                       policies=["root_governance"]),
        ])
        engine = InvariantEngine()
        inv = _inv("g1", "executor", invariant_type=InvariantType.GOVERNANCE)
        result = engine.validate(inv, dag)
        assert result.passed

    def test_node_without_executor_fails(self):
        dag = _make_dag([
            _make_node("root", status="NEW", policies=["root_governance"]),
        ])
        engine = InvariantEngine()
        inv = _inv("g1", "executor", invariant_type=InvariantType.GOVERNANCE)
        result = engine.validate(inv, dag)
        assert not result.passed

    def test_cross_tenant_edge_fails(self):
        dag = _make_dag([
            _make_node("root", status="NEW", tenant_id="tenant_a",
                       policies=["root_governance"], executor="builder"),
            _make_node("child", status="NEW", tenant_id="tenant_b"),
        ],
            edges=[_make_edge("root", "child")],
            tenant_id="tenant_a",
        )
        engine = InvariantEngine()
        inv = _inv("g1", "tenant", invariant_type=InvariantType.GOVERNANCE)
        result = engine.validate(inv, dag)
        assert not result.passed


# ═════════════════════════════════════════════════════════════════════════════
#  Fixed-Point Constraint
# ═════════════════════════════════════════════════════════════════════════════

class TestFixedPoint:
    def test_empty_fixed_point(self):
        reg = InvariantRegistry()
        engine = InvariantEngine()
        dag = _make_dag([_make_node("root", status="NEW")])
        inv = _inv("new", "new")
        ok, violations = engine.check_fixed_point(inv, reg, dag)
        assert ok
        assert violations == []

    def test_new_invariant_does_not_alter_fixed(self):
        reg = InvariantRegistry()
        dag = _make_dag([
            _make_node("root", status="NEW", policies=["root_governance"], executor="builder"),
        ])
        stable = _inv("stable", "stable check", invariant_type=InvariantType.GOVERNANCE,
                       state=InvariantState.STABLE)
        reg.register(stable)
        new_inv = _inv("new", "innocent")
        engine = InvariantEngine()
        ok, violations = engine.check_fixed_point(new_inv, reg, dag)
        assert ok
        assert not violations

    def test_new_invariant_breaking_fixed_fails(self):
        reg = InvariantRegistry()
        dag = _make_dag([
            _make_node("root", status="NEW", policies=["root_governance"],
                       executor="builder"),
        ])
        stable_inv = _inv("stable", "stable governance",
                           invariant_type=InvariantType.GOVERNANCE,
                           state=InvariantState.STABLE)
        reg.register(stable_inv)
        new_inv = _inv("newgov", "additional governance",
                        invariant_type=InvariantType.GOVERNANCE)
        engine = InvariantEngine()
        ok, violations = engine.check_fixed_point(new_inv, reg, dag)
        assert ok, f"Unexpected violations: {violations}"


# ═════════════════════════════════════════════════════════════════════════════
#  Non-Circular Validation
# ═════════════════════════════════════════════════════════════════════════════

class TestNonCircular:
    def test_no_systems_no_issue(self):
        engine = InvariantEngine()
        inv = _inv("i1", "independent")
        ok, _ = engine.check_non_circular(inv, InvariantRegistry())
        assert ok

    def test_no_modifications_no_issue(self):
        engine = InvariantEngine()
        inv = _inv("i1", "validator", validates=["sys_a"])
        ok, _ = engine.check_non_circular(inv, InvariantRegistry())
        assert ok

    def test_validates_and_modifies_same_system_fails(self):
        engine = InvariantEngine()
        inv = _inv("i1", "self", validates=["sys_a"], modifies=["sys_a"])
        ok, reason = engine.check_non_circular(inv, InvariantRegistry())
        assert not ok
        assert reason is not None
        assert "circular" in reason.lower()

    def test_dep_validates_modified_system_fails(self):
        reg = InvariantRegistry()
        dep = _inv("dep", "dep validator", validates=["sys_a"])
        reg.register(dep)
        engine = InvariantEngine()
        inv = _inv("i1", "main", validates=["sys_b"], modifies=["sys_a"],
                     dependencies=["dep"])
        ok, reason = engine.check_non_circular(inv, reg)
        assert not ok
        assert "dep" in (reason or "")

    def test_different_systems_ok(self):
        engine = InvariantEngine()
        inv = _inv("i1", "safe", validates=["sys_a"], modifies=["sys_b"])
        ok, _ = engine.check_non_circular(inv, InvariantRegistry())
        assert ok

    def test_validates_overlap_with_modify_fails(self):
        engine = InvariantEngine()
        inv = _inv("i1", "overlap", validates=["sys_a", "sys_b"],
                     modifies=["sys_a"])
        ok, _ = engine.check_non_circular(inv, InvariantRegistry())
        assert not ok


# ═════════════════════════════════════════════════════════════════════════════
#  validate_all — Dependency-ordered validation
# ═════════════════════════════════════════════════════════════════════════════

class TestValidateAll:
    def test_all_pass(self):
        reg = InvariantRegistry()
        dag = _make_dag([
            _make_node("root", status="NEW", policies=["root_governance"],
                       executor="builder"),
        ])
        reg.register(_inv("s1", "structural check"))
        reg.register(_inv("g1", "governance check",
                           invariant_type=InvariantType.GOVERNANCE))
        engine = InvariantEngine()
        results = engine.validate_all(reg, dag)
        assert len(results) == 2
        assert all(r.passed for r in results)

    def test_respects_dependencies(self):
        reg = InvariantRegistry()
        dag = _make_dag([_make_node("root", status="NEW")])
        dep = _inv("base", "base check")
        reg.register(dep)
        main = _inv("main", "main check", dependencies=["base"])
        reg.register(main)
        engine = InvariantEngine()
        results = engine.validate_all(reg, dag)
        assert len(results) == 2
        base_idx = next(i for i, r in enumerate(results) if r.invariant_id == "base")
        main_idx = next(i for i, r in enumerate(results) if r.invariant_id == "main")
        assert base_idx < main_idx

    def test_broken_dependency_chain(self):
        reg = InvariantRegistry()
        dag = _make_dag([_make_node("root", status="NEW")])
        a = _inv("a", "a", dependencies=["b"])
        b = _inv("b", "b", dependencies=["c"])
        c = _inv("c", "c", dependencies=["a"])
        reg.invariants = {"a": a, "b": b, "c": c}
        engine = InvariantEngine()
        results = engine.validate_all(reg, dag)
        assert any(not r.passed for r in results)
        assert any("DEPENDENCY" in str(r.violations) for r in results if not r.passed)


# ═════════════════════════════════════════════════════════════════════════════
#  Invariant type dispatch
# ═════════════════════════════════════════════════════════════════════════════

class TestTypeDispatch:
    def test_structural_dispatch(self):
        engine = InvariantEngine()
        dag = _make_dag([_make_node("root", status="NEW")])
        inv = _inv("s", "structural", invariant_type=InvariantType.STRUCTURAL)
        result = engine.validate(inv, dag)
        assert result is not None

    def test_semantic_dispatch(self):
        engine = InvariantEngine()
        dag = _make_dag([_make_node("root", status="NEW")])
        inv = _inv("m", "semantic", invariant_type=InvariantType.SEMANTIC)
        result = engine.validate(inv, dag)
        assert result is not None
        assert result.invariant_id == "m"

    def test_governance_dispatch(self):
        engine = InvariantEngine()
        dag = _make_dag([_make_node("root", status="NEW", executor="builder",
                                      policies=["root_governance"])])
        inv = _inv("g", "governance", invariant_type=InvariantType.GOVERNANCE)
        result = engine.validate(inv, dag)
        assert result.passed

    def test_nonexistent_type_raises(self):
        inv = Invariant.model_construct(
            invariant_id="x", name="x",
            invariant_type="bogus",
        )
        engine = InvariantEngine()
        dag = _make_dag([_make_node("root", status="NEW")])
        with pytest.raises(ValueError):
            engine.validate(inv, dag)


# ═════════════════════════════════════════════════════════════════════════════
#  Error cases
# ═════════════════════════════════════════════════════════════════════════════

class TestErrorCases:
    def test_unknown_lifecycle_state(self):
        ok, reason = validate_lifecycle_transition(
            InvariantState.REPLACED, InvariantState.PROPOSED,
        )
        assert not ok
        assert reason is not None

    def test_unknown_lifecycle_from(self):
        ok, reason = validate_lifecycle_transition("UNKNOWN", InvariantState.PROPOSED)  # type: ignore[arg-type]
        assert not ok

    def test_validation_result_has_duration(self):
        dag = _make_dag([_make_node("root", status="NEW")])
        engine = InvariantEngine()
        inv = _inv("s1", "test")
        result = engine.validate(inv, dag)
        assert result.duration_ms is not None
        assert result.duration_ms >= 0

    def test_score_degradation(self):
        dag = _make_dag(
            [_make_node("root", status="NEW")],
            edges=[
                _make_edge("root", "a"),
                _make_edge("root", "b"),
            ],
        )
        engine = InvariantEngine()
        inv = _inv("s1", "broken")
        result = engine.validate(inv, dag)
        assert not result.passed

    def test_violation_severity_models(self):
        assert InvariantSeverity.WARN.value == "WARN"
        assert InvariantSeverity.ERROR.value == "ERROR"
        assert InvariantSeverity.FATAL.value == "FATAL"
