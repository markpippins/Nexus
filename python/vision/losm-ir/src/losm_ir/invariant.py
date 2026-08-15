"""
WRP v1.2 — Validation and Invariant Checking Engine

Invariant lifecycle state machine, scoring thresholds, fixed-point
constraint enforcement, non-circular validation guard, and DAG
validation for structural, semantic, and governance invariants.

Depends on the compiled WorkRequestDAG (v1.1) and the TraversalEngine
(v1.2) as the runtime artifact context.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from losm_ir.executor_registry import DEFAULT_KNOWN_EXECUTORS

from pydantic import BaseModel, Field

from losm_ir.dag import EdgeType, WorkRequestDAG, WorkRequestNode
from losm_ir.states import WorkStatus
from losm_ir.transition import validate_transition
from losm_ir.traversal import (
    ExecutionResult,
    HierarchicalExecutionReceipt,
    TraversalEngine,
    TraversalStrategy,
)


# ── Core Enums ─────────────────────────────────────────────────────────────────

class InvariantType(str, Enum):
    STRUCTURAL = "structural"
    SEMANTIC = "semantic"
    GOVERNANCE = "governance"


class InvariantState(str, Enum):
    PROPOSED = "PROPOSED"
    TESTED = "TESTED"
    VALIDATED = "VALIDATED"
    STABLE = "STABLE"
    DEPRECATED = "DEPRECATED"
    REPLACED = "REPLACED"


class InvariantSeverity(str, Enum):
    WARN = "WARN"
    ERROR = "ERROR"
    FATAL = "FATAL"


# ── Invariant Lifecycle ────────────────────────────────────────────────────────

INVARIANT_LIFECYCLE_TRANSITIONS: Dict[InvariantState, Set[InvariantState]] = {
    InvariantState.PROPOSED: {InvariantState.TESTED, InvariantState.DEPRECATED},
    InvariantState.TESTED: {InvariantState.VALIDATED, InvariantState.PROPOSED, InvariantState.DEPRECATED},
    InvariantState.VALIDATED: {InvariantState.STABLE, InvariantState.TESTED, InvariantState.DEPRECATED},
    InvariantState.STABLE: {InvariantState.DEPRECATED},
    InvariantState.DEPRECATED: {InvariantState.REPLACED},
    InvariantState.REPLACED: set(),
}

SCORE_THRESHOLD_STABLE = 0.85
SCORE_THRESHOLD_VALIDATED = 0.65
SCORE_THRESHOLD_TESTED = 0.4
SCORE_DISCARD = 0.4


def validate_lifecycle_transition(
    current: InvariantState, target: InvariantState,
) -> Tuple[bool, Optional[str]]:
    allowed = INVARIANT_LIFECYCLE_TRANSITIONS.get(current)
    if allowed is None:
        return False, f"Unknown state: {current}"
    if target in allowed:
        return True, None
    return False, (
        f"Cannot transition from {current.value} to {target.value}. "
        f"Allowed: {', '.join(s.value for s in sorted(allowed, key=lambda x: x.value))}"
    )


def lifecycle_advance_by_score(
    current: InvariantState, score: float,
) -> Tuple[InvariantState, Optional[str]]:
    if score >= SCORE_THRESHOLD_STABLE:
        target = InvariantState.STABLE
    elif score >= SCORE_THRESHOLD_VALIDATED:
        target = InvariantState.VALIDATED
    elif score >= SCORE_THRESHOLD_TESTED:
        target = InvariantState.TESTED
    else:
        if current == InvariantState.PROPOSED:
            return current, f"Score {score:.2f} below TESTED threshold {SCORE_THRESHOLD_TESTED} — stays PROPOSED"
        return current, f"Score {score:.2f} dropped below TESTED threshold — stays {current.value}"
    ok, reason = validate_lifecycle_transition(current, target)
    if ok:
        return target, None
    return current, reason or f"Cannot advance {current.value} → {target.value}"


# ── Invariant Model ────────────────────────────────────────────────────────────

class Invariant(BaseModel):
    """A single validated invariant with lifecycle state and scoring.

    Fields:
        invariant_id: Unique identifier.
        name: Human-readable name.
        description: What this invariant enforces.
        invariant_type: STRUCTURAL, SEMANTIC, or GOVERNANCE.
        state: Current lifecycle state.
        score: Current validation score [0.0, 1.0].
        severity: Severity if violated.
        scope: Node IDs or system scope this invariant applies to (empty = all).
        depends_on: Other invariant IDs that must pass first.
        expression: Optional predicate expression (reserved for future use).
        validates_systems: Systems/nodes this invariant validates.
                          Used for non-circular check.
        metadata: Arbitrary metadata.
    """
    invariant_id: str
    name: str
    description: str = ""
    invariant_type: InvariantType = InvariantType.STRUCTURAL
    state: InvariantState = InvariantState.PROPOSED
    score: float = 0.0
    severity: InvariantSeverity = InvariantSeverity.ERROR
    scope: List[str] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list)
    expression: Optional[str] = None
    validates_systems: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ── Validation Results ─────────────────────────────────────────────────────────

class Violation(BaseModel):
    """A single invariant violation found during validation."""
    invariant_id: str
    invariant_name: str
    rule_id: str
    severity: InvariantSeverity
    message: str
    target_node_id: Optional[str] = None
    detail: Dict[str, Any] = Field(default_factory=dict)


class InvariantValidationResult(BaseModel):
    """Result of running an invariant against a DAG."""
    invariant_id: str
    invariant_name: str
    passed: bool
    score: float
    violations: List[Violation] = Field(default_factory=list)
    duration_ms: Optional[float] = None


# ── Invariant Registry ─────────────────────────────────────────────────────────

class InvariantRegistry(BaseModel):
    """Registry of invariants with lifecycle management and scoring."""
    invariants: Dict[str, Invariant] = Field(default_factory=dict)

    def register(self, invariant: Invariant) -> None:
        if invariant.invariant_id in self.invariants:
            raise ValueError(
                f"Invariant {invariant.invariant_id} already registered. "
                "Use replace() to supersede."
            )
        if invariant.depends_on:
            for dep_id in invariant.depends_on:
                if dep_id not in self.invariants:
                    raise ValueError(
                        f"Dependency {dep_id} for {invariant.invariant_id} not found"
                    )
        self.invariants[invariant.invariant_id] = invariant

    def replace(self, invariant: Invariant) -> None:
        old = self.invariants.get(invariant.invariant_id)
        if old is not None:
            old.state = InvariantState.REPLACED
        self.invariants[invariant.invariant_id] = invariant

    def get_fixed_point_set(self) -> Dict[str, Invariant]:
        return {
            iid: inv for iid, inv in self.invariants.items()
            if inv.state in (InvariantState.VALIDATED, InvariantState.STABLE)
        }


# ── InvariantEngine ────────────────────────────────────────────────────────────

class InvariantEngine:
    """Validates invariants against compiled WorkRequestDAGs.

    Core operations:
      - validate(invariant, dag) — single invariant against DAG
      - validate_all(registry, dag) — all invariants against DAG
      - check_fixed_point(new_invariant, registry) — fixed-point constraint
      - check_non_circular(invariant) — non-circular validation
    """

    def __init__(self, known_executors: Optional[Set[str]] = None):
        """Create an engine.

        Args:
            known_executors: Optional override of the canonical executor set
                used by governance checks (G2 executor assignment). Defaults
                to ``DEFAULT_KNOWN_EXECUTORS``; canonical callers may pass the
                live tackle.roles set for hydration (see wr-conf-009).
        """
        self._known_executors = (
            set(DEFAULT_KNOWN_EXECUTORS) if known_executors is None
            else set(known_executors)
        )

    def validate(
        self,
        invariant: Invariant,
        dag: WorkRequestDAG,
        execution_receipt: Optional[HierarchicalExecutionReceipt] = None,
    ) -> InvariantValidationResult:
        if invariant.invariant_type == InvariantType.STRUCTURAL:
            return self._validate_structural(invariant, dag)
        elif invariant.invariant_type == InvariantType.SEMANTIC:
            return self._validate_semantic(invariant, dag, execution_receipt)
        elif invariant.invariant_type == InvariantType.GOVERNANCE:
            return self._validate_governance(invariant, dag)
        raise ValueError(f"Unknown invariant type: {invariant.invariant_type}")

    def validate_all(
        self,
        registry: InvariantRegistry,
        dag: WorkRequestDAG,
        execution_receipt: Optional[HierarchicalExecutionReceipt] = None,
    ) -> List[InvariantValidationResult]:
        results: List[InvariantValidationResult] = []
        pending = set(registry.invariants.keys())
        resolved: Set[str] = set()

        while pending:
            batch = {
                iid for iid in pending
                if all(d in resolved for d in registry.invariants[iid].depends_on)
            }
            if not batch:
                for iid in pending:
                    results.append(InvariantValidationResult(
                        invariant_id=iid,
                        invariant_name=registry.invariants[iid].name,
                        passed=False, score=0.0,
                        violations=[Violation(
                            invariant_id=iid,
                            invariant_name=registry.invariants[iid].name,
                            rule_id="DEPENDENCY",
                            severity=InvariantSeverity.FATAL,
                            message=f"Unresolved dependency chain for {iid}",
                        )],
                    ))
                break
            for iid in sorted(batch):
                inv = registry.invariants[iid]
                result = self.validate(inv, dag, execution_receipt)
                results.append(result)
                resolved.add(iid)
            pending -= batch
        return results

    # ── Fixed-point constraint ──────────────────────────────────────

    def check_fixed_point(
        self,
        new_invariant: Invariant,
        registry: InvariantRegistry,
        dag: WorkRequestDAG,
    ) -> Tuple[bool, List[str]]:
        fixed = registry.get_fixed_point_set()
        if not fixed:
            return True, []
        baseline = {
            iid: self.validate(inv, dag)
            for iid, inv in fixed.items()
        }
        test_registry = InvariantRegistry(invariants=dict(registry.invariants))
        test_registry.register(new_invariant)
        test_results = {
            iid: self.validate(test_registry.invariants[iid], dag)
            for iid in fixed
        }
        violations: List[str] = []
        for iid in fixed:
            base_pass = baseline[iid].passed
            test_pass = test_results[iid].passed
            if base_pass and not test_pass:
                violations.append(
                    f"Invariant {iid} ('{fixed[iid].name}') changed from PASS to FAIL "
                    f"after adding '{new_invariant.invariant_id}'"
                )
            if base_pass and test_results[iid].score < baseline[iid].score - 0.01:
                violations.append(
                    f"Invariant {iid} score dropped from {baseline[iid].score:.2f} "
                    f"to {test_results[iid].score:.2f}"
                )
        return len(violations) == 0, violations

    # ── Non-circular constraint ─────────────────────────────────────

    def check_non_circular(
        self,
        invariant: Invariant,
        registry: InvariantRegistry,
    ) -> Tuple[bool, Optional[str]]:
        """Invariant cannot be validated solely by systems it modifies."""
        if not invariant.validates_systems:
            return True, None
        modified_systems = set(invariant.metadata.get("modifies_systems", []))
        if not modified_systems:
            return True, None
        overlap = set(invariant.validates_systems) & modified_systems
        if overlap:
            return False, (
                f"Invariant {invariant.invariant_id} validates system(s) "
                f"{sorted(overlap)} that it also modifies — circular dependency"
            )
        deps_validate = set(invariant.depends_on)
        for dep_id in deps_validate:
            dep = registry.invariants.get(dep_id)
            if dep and set(dep.validates_systems) & modified_systems:
                return False, (
                    f"Invariant {invariant.invariant_id} depends on {dep_id} "
                    f"which validates a system modified by {invariant.invariant_id}"
                )
        return True, None

    # ── Structural validation ───────────────────────────────────────

    def _validate_structural(
        self,
        invariant: Invariant,
        dag: WorkRequestDAG,
    ) -> InvariantValidationResult:
        violations: List[Violation] = []
        start = datetime.utcnow()

        # S1: Node connectivity — all edges reference valid nodes
        all_node_ids = set(dag.nodes.keys())
        for e in dag.edges:
            if e.parent_wr_id not in all_node_ids:
                violations.append(Violation(
                    invariant_id=invariant.invariant_id,
                    invariant_name=invariant.name,
                    rule_id="S1",
                    severity=invariant.severity,
                    message=f"Edge parent {e.parent_wr_id} not found in DAG nodes",
                    target_node_id=e.parent_wr_id,
                ))
            if e.child_wr_id not in all_node_ids:
                violations.append(Violation(
                    invariant_id=invariant.invariant_id,
                    invariant_name=invariant.name,
                    rule_id="S1",
                    severity=invariant.severity,
                    message=f"Edge child {e.child_wr_id} not found in DAG nodes",
                    target_node_id=e.child_wr_id,
                ))

        # S2: Root node exists and is in nodes
        if dag.root_wr_id and dag.root_wr_id not in all_node_ids:
            violations.append(Violation(
                invariant_id=invariant.invariant_id,
                invariant_name=invariant.name,
                rule_id="S2",
                severity=InvariantSeverity.FATAL,
                message=f"Root node {dag.root_wr_id} not in DAG nodes",
                target_node_id=dag.root_wr_id,
            ))

        # S3: Depth is consistent
        for nid, node in dag.nodes.items():
            expected_depth = node.depth
            computed_children_depth = expected_depth + 1
            for cid in node.children:
                child = dag.nodes.get(cid)
                if child and child.depth != computed_children_depth:
                    violations.append(Violation(
                        invariant_id=invariant.invariant_id,
                        invariant_name=invariant.name,
                        rule_id="S3",
                        severity=InvariantSeverity.ERROR,
                        message=f"Node {cid} depth {child.depth} != expected {computed_children_depth}",
                        target_node_id=cid,
                    ))

        # S4: Edge type validity
        valid_types = {et.value for et in EdgeType}
        for e in dag.edges:
            et = e.edge_type.value if hasattr(e.edge_type, 'value') else str(e.edge_type)
            if et not in valid_types:
                violations.append(Violation(
                    invariant_id=invariant.invariant_id,
                    invariant_name=invariant.name,
                    rule_id="S4",
                    severity=InvariantSeverity.ERROR,
                    message=f"Invalid edge type '{et}' on {e.edge_id}",
                    target_node_id=e.edge_id,
                    detail={"edge_type": et},
                ))

        passed = len(violations) == 0
        score = 1.0 if passed else max(0.0, 1.0 - len(violations) * 0.2)
        elapsed = (datetime.utcnow() - start).total_seconds() * 1000

        return InvariantValidationResult(
            invariant_id=invariant.invariant_id,
            invariant_name=invariant.name,
            passed=passed, score=score,
            violations=violations, duration_ms=elapsed,
        )

    # ── Semantic validation ─────────────────────────────────────────

    def _validate_semantic(
        self,
        invariant: Invariant,
        dag: WorkRequestDAG,
        execution_receipt: Optional[HierarchicalExecutionReceipt] = None,
    ) -> InvariantValidationResult:
        violations: List[Violation] = []
        start = datetime.utcnow()
        valid_statuses = {ws.value for ws in WorkStatus}

        # M1: All node statuses are valid
        for nid, node in dag.nodes.items():
            if node.status not in valid_statuses:
                violations.append(Violation(
                    invariant_id=invariant.invariant_id,
                    invariant_name=invariant.name,
                    rule_id="M1",
                    severity=InvariantSeverity.FATAL,
                    message=f"Node {nid} has unknown status '{node.status}'",
                    target_node_id=nid,
                ))

        # M2: Edge direction consistency — no parent_of/child_of mismatch
        for e in dag.edges:
            if e.edge_type == EdgeType.CHILD_OF:
                violations.append(Violation(
                    invariant_id=invariant.invariant_id,
                    invariant_name=invariant.name,
                    rule_id="M2",
                    severity=InvariantSeverity.WARN,
                    message=f"Edge {e.edge_id} uses CHILD_OF direction; consider PARENT_OF",
                    target_node_id=e.edge_id,
                ))

        # M3: Receipt consistency (if receipt provided)
        if execution_receipt is not None:
            results = execution_receipt.all_results()
            for nid in dag.nodes:
                if nid not in results:
                    pass  # terminal nodes may not appear in receipt
                else:
                    node = dag.nodes[nid]
                    receipt_result = results[nid]
                    if node.status in ("FAILED",) and receipt_result != ExecutionResult.FAILED:
                        violations.append(Violation(
                            invariant_id=invariant.invariant_id,
                            invariant_name=invariant.name,
                            rule_id="M3",
                            severity=InvariantSeverity.WARN,
                            message=f"Node {nid} status={node.status} but receipt result={receipt_result.value}",
                            target_node_id=nid,
                        ))

        passed = len(violations) == 0
        score = 1.0 if passed else max(0.0, 1.0 - len(violations) * 0.15)
        elapsed = (datetime.utcnow() - start).total_seconds() * 1000

        return InvariantValidationResult(
            invariant_id=invariant.invariant_id,
            invariant_name=invariant.name,
            passed=passed, score=score,
            violations=violations, duration_ms=elapsed,
        )

    # ── Governance validation ───────────────────────────────────────

    def _validate_governance(
        self,
        invariant: Invariant,
        dag: WorkRequestDAG,
    ) -> InvariantValidationResult:
        violations: List[Violation] = []
        start = datetime.utcnow()

        # G1: Root node governance — root must have governing policy
        root = dag.nodes.get(dag.root_wr_id)
        if root:
            policies = root.compiled_properties.get("policies", [])
            if "root_governance" not in policies:
                violations.append(Violation(
                    invariant_id=invariant.invariant_id,
                    invariant_name=invariant.name,
                    rule_id="G1",
                    severity=InvariantSeverity.WARN,
                    message=f"Root node {dag.root_wr_id} lacks root_governance policy",
                    target_node_id=dag.root_wr_id,
                ))

        # G2: Executor assignment — all non-terminal nodes need executors
        known_executors = self._known_executors
        for nid, node in dag.nodes.items():
            if node.status in ("COMPLETION", "COMPLETE", "FAILED", "BLOCKED"):
                continue
            executor = node.metadata.get("executor", "").lower()
            if not executor:
                violations.append(Violation(
                    invariant_id=invariant.invariant_id,
                    invariant_name=invariant.name,
                    rule_id="G2",
                    severity=InvariantSeverity.ERROR,
                    message=f"Node {nid} has no executor assigned",
                    target_node_id=nid,
                ))
            elif executor not in known_executors:
                violations.append(Violation(
                    invariant_id=invariant.invariant_id,
                    invariant_name=invariant.name,
                    rule_id="G2",
                    severity=InvariantSeverity.WARN,
                    message=f"Node {nid} has unknown executor '{executor}'",
                    target_node_id=nid,
                ))

        # G3: Tenant isolation — no cross-tenant edges
        if dag.tenant_id:
            for e in dag.edges:
                parent = dag.nodes.get(e.parent_wr_id)
                child = dag.nodes.get(e.child_wr_id)
                if parent and child:
                    p_tenant = parent.metadata.get("tenant_id", dag.tenant_id)
                    c_tenant = child.metadata.get("tenant_id", dag.tenant_id)
                    if p_tenant and c_tenant and p_tenant != c_tenant:
                        violations.append(Violation(
                            invariant_id=invariant.invariant_id,
                            invariant_name=invariant.name,
                            rule_id="G3",
                            severity=InvariantSeverity.FATAL,
                            message=f"Cross-tenant edge {e.edge_id}: {p_tenant} → {c_tenant}",
                            target_node_id=e.edge_id,
                            detail={"parent_tenant": p_tenant, "child_tenant": c_tenant},
                        ))

        passed = len(violations) == 0
        score = 1.0 if passed else max(0.0, 1.0 - len(violations) * 0.2)
        elapsed = (datetime.utcnow() - start).total_seconds() * 1000

        return InvariantValidationResult(
            invariant_id=invariant.invariant_id,
            invariant_name=invariant.name,
            passed=passed, score=score,
            violations=violations, duration_ms=elapsed,
        )


__all__ = [
    "InvariantType",
    "InvariantState",
    "InvariantSeverity",
    "Invariant",
    "Violation",
    "InvariantValidationResult",
    "InvariantRegistry",
    "InvariantEngine",
    "INVARIANT_LIFECYCLE_TRANSITIONS",
    "validate_lifecycle_transition",
    "lifecycle_advance_by_score",
    "SCORE_THRESHOLD_STABLE",
    "SCORE_THRESHOLD_VALIDATED",
    "SCORE_THRESHOLD_TESTED",
    "SCORE_DISCARD",
]
