"""
Conduit → WRP Projection Reducer v0.1

Deterministic, replay-safe projection from Conduit receipt streams into
WRP state projections with stratification and cross-reference metadata.

Design invariants:
- Receipts are authoritative; projections are derived (§I1)
- Projection may be deleted and reconstructed at any time (§I2)
- Same receipts + same ordering = identical output (§I3)
- Canonical ordering is applied before any state reduction (§I4)

Spec: audit/SPECS/CONDUIT_WRP_BRIDGE.md
TS contract: typescript/nebula-mcp/src/conduit-wrp-contract.ts
Plan reference: #0174
"""

from dataclasses import dataclass, field
from typing import List, Optional

from nexus_core.wrp.states import (
    WRP_ADJACENCY_MATRIX,
    RECEIPT_TO_WRP_STATE,
    is_valid_transition,
)


# ── 1. Core types: Receipt & State ────────────────────────────────────────

ConduitReceiptType = (
    "PROPOSED", "PLANNING", "PLAN_CREATE",
    "CRITIQUE", "CRITIQUE_PASS", "CRITIQUE_REJECT",
    "IMPLEMENTATION", "REVIEW", "REVIEW_PASS", "REVIEW_REJECT",
    "BLOCK", "PLAN_BLOCK", "API_LIMIT",
    "REQUEUED", "CANCELLED", "ABANDONED",
)

WRPState = (
    "CREATED", "INTAKE", "PLANNING", "CRITIQUE",
    "SPECIFICATION", "APPROVED", "QUEUED", "EXECUTING",
    "COMPLETED", "ARCHIVED", "FAILED",
)

WRPStateCategory = ("initial", "active", "gate", "terminal")

AbstractionLevel = ("L1", "L2", "L3", "L4")
VisibilityScope = ("builder", "architect", "planner", "reviewer", "all")
ChunkKind = (
    "OVERVIEW", "DEFINITION", "DATA_MODEL", "ALGORITHM",
    "PROTOCOL", "CONFIGURATION", "CONSTRAINTS", "RATIONALE",
    "EXAMPLE", "USAGE", "ERROR", "META",
)


@dataclass
class ConduitReceipt:
    plan_id: str
    sequence: int
    created_at: str
    receipt_id: str
    type: str
    agent_role: str
    summary: str
    metadata: dict = field(default_factory=dict)
    session_id: Optional[str] = None
    ticket_id: Optional[str] = None
    artifact_path: Optional[str] = None
    tokens_used: Optional[int] = None


@dataclass
class WRPEvent:
    receipt_id: str
    receipt_type: str
    from_state: str
    to_state: str
    valid: bool
    timestamp: str


@dataclass
class StratifiedChunk:
    content: str
    level: str
    chunk_kind: str
    visibility_scope: str
    normative_strength: Optional[str] = None


@dataclass
class CrossReference:
    rel_type: str
    source_id: str
    target_id: str
    metadata: Optional[dict] = None


@dataclass
class WRPProjection:
    plan_id: str
    title: str
    project: str
    wrp_state: str
    state_history: List[WRPEvent]
    applied_receipt_ids: List[str]
    total_receipts: int
    skipped_receipts: int
    partial: bool
    incomplete_start: bool
    errors: List[dict]
    abstraction_level: str
    chunks: List[StratifiedChunk]
    visibility_scope: str
    cross_references: List[CrossReference]
    goal: str
    files_affected: List[str]
    acceptance_criteria: List[str]
    dependencies: List[str]


# ── 2. State utility ─────────────────────────────────────────────────────

_WRP_STATE_CATEGORY: dict = {
    "CREATED": "initial",
    "INTAKE": "active",
    "PLANNING": "active",
    "CRITIQUE": "active",
    "SPECIFICATION": "active",
    "QUEUED": "active",
    "EXECUTING": "active",
    "APPROVED": "gate",
    "COMPLETED": "terminal",
    "ARCHIVED": "terminal",
    "FAILED": "terminal",
}


def wrp_state_category(state: str) -> str:
    return _WRP_STATE_CATEGORY.get(state, "active")


# ── 3. Receipt → WRP state map (§4.3) ────────────────────────────────────
# Delegates to canonical states.py RECEIPT_TO_WRP_STATE.

def receipt_to_wrp_state(receipt_type: str) -> str:
    return RECEIPT_TO_WRP_STATE[receipt_type]  # KeyError for unknown types (fail-fast)


# ── 4. WRP adjacency matrix ──────────────────────────────────────────────
# Delegates to canonical states.py is_valid_transition().

# (is_valid_transition imported from states.py at module level)


# ── 5. Canonical ordering (§3) ────────────────────────────────────────────

def compare_receipts(a: ConduitReceipt, b: ConduitReceipt) -> int:
    if a.sequence != b.sequence:
        return a.sequence - b.sequence
    if a.created_at < b.created_at:
        return -1
    if a.created_at > b.created_at:
        return 1
    if a.receipt_id < b.receipt_id:
        return -1
    if a.receipt_id > b.receipt_id:
        return 1
    return 0


def sort_receipts(receipts: List[ConduitReceipt]) -> List[ConduitReceipt]:
    return sorted(receipts, key=lambda r: (r.sequence, r.created_at, r.receipt_id))


# ── 6. Stratification heuristics (§6) ────────────────────────────────────

def determine_abstraction_level(
    state: str,
    has_cross_system_impact: bool = False,
    has_architectural_content: bool = False,
    has_structural_content: bool = False,
) -> str:
    if has_cross_system_impact or state in ("ARCHIVED", "FAILED"):
        return "L4"
    if has_architectural_content or state in ("APPROVED", "COMPLETED"):
        return "L3"
    if has_structural_content or state in ("SPECIFICATION", "EXECUTING"):
        return "L2"
    return "L1"


_VISIBILITY_FOR_LEVEL: dict = {
    "L1": "builder",
    "L2": "all",
    "L3": "architect",
    "L4": "architect",
}


def level_to_visibility_scope(level: str) -> str:
    return _VISIBILITY_FOR_LEVEL.get(level, "all")


# ── 7. Chunk building ─────────────────────────────────────────────────────

def build_chunks(
    title: str,
    goal: str,
    files_affected: List[str],
    acceptance_criteria: List[str],
    state: str,
    level: str,
    scope: str,
) -> List[StratifiedChunk]:
    chunks: List[StratifiedChunk] = []

    chunks.append(StratifiedChunk(
        content=title,
        level=level,
        chunk_kind="OVERVIEW",
        visibility_scope=scope,
        normative_strength="normative",
    ))

    if goal:
        chunks.append(StratifiedChunk(
            content=goal,
            level=level,
            chunk_kind="RATIONALE" if len(goal) > 200 else "DEFINITION",
            visibility_scope=scope,
            normative_strength="normative",
        ))

    if files_affected:
        chunks.append(StratifiedChunk(
            content="\n".join(files_affected),
            level=level,
            chunk_kind="CONFIGURATION",
            visibility_scope="all",
            normative_strength="informative",
        ))

    if acceptance_criteria:
        chunks.append(StratifiedChunk(
            content="\n".join(acceptance_criteria),
            level=level,
            chunk_kind="CONSTRAINTS",
            visibility_scope="all",
            normative_strength="normative",
        ))

    if state == "FAILED":
        chunks.append(StratifiedChunk(
            content="Plan terminated in FAILED state",
            level="L4",
            chunk_kind="ERROR",
            visibility_scope="architect",
            normative_strength="informative",
        ))
    elif state in ("COMPLETED", "ARCHIVED"):
        chunks.append(StratifiedChunk(
            content=f"Plan reached terminal state: {state}",
            level="L3",
            chunk_kind="META",
            visibility_scope="architect",
            normative_strength="historical",
        ))

    return chunks


# ── 8. Cross-reference building (§7) ─────────────────────────────────────

from nexus_core.crossref_taxonomy import CrossReferenceType as _CRType


def build_cross_references(
    plan_id: str,
    dependencies: List[str],
    files_affected: List[str],
    prompt_ref: str = "",
) -> List[CrossReference]:
    refs: List[CrossReference] = []

    for dep in dependencies:
        dep_id = dep.lstrip("#0")
        refs.append(CrossReference(
            rel_type=_CRType.WRP_DEPENDS_ON,
            source_id=plan_id,
            target_id=dep_id,
            metadata={"dependencyType": "explicit"},
        ))

    seen = set()
    for file in files_affected:
        system = file.split("/")[0]
        if system and system not in seen:
            seen.add(system)
            refs.append(CrossReference(
                rel_type=_CRType.WRP_IMPACTS_SYSTEM,
                source_id=plan_id,
                target_id=system,
                metadata={"file": file},
            ))

    if prompt_ref:
        refs.append(CrossReference(
            rel_type=_CRType.WRP_IMPLEMENTS,
            source_id=plan_id,
            target_id=prompt_ref,
            metadata={"kind": "prompt"},
        ))

    return refs


# ── 9. Core reducer (§5) ─────────────────────────────────────────────────

class WRPProjectionBuilder:
    """Builds a WRPProjection from Conduit receipt stream.

    Pure function. Deterministic. No external dependencies.
    Call as: WRPProjectionBuilder.reduce(plan_id, title, ..., receipts)
    """

    @staticmethod
    def reduce(
        plan_id: str,
        title: str,
        project: str,
        goal: str,
        files_affected: List[str],
        acceptance_criteria: List[str],
        dependencies: List[str],
        receipts: List[ConduitReceipt],
        prompt_ref: str = "",
    ) -> WRPProjection:
        sorted_receipts = sort_receipts(receipts)

        current_state = "CREATED"
        state_history: List[WRPEvent] = []
        applied_ids: List[str] = []
        skipped = 0
        errors: List[dict] = []

        for receipt in sorted_receipts:
            candidate = receipt_to_wrp_state(receipt.type)
            valid = is_valid_transition(current_state, candidate)

            state_history.append(WRPEvent(
                receipt_id=receipt.receipt_id,
                receipt_type=receipt.type,
                from_state=current_state,
                to_state=candidate,
                valid=valid,
                timestamp=receipt.created_at,
            ))

            if valid:
                current_state = candidate
                applied_ids.append(receipt.receipt_id)
            else:
                skipped += 1
                errors.append({
                    "receiptId": receipt.receipt_id,
                    "message": f"Invalid transition: {current_state} -> {candidate} (via {receipt.type})",
                })

        partial = len(receipts) == 0
        incomplete_start = len(receipts) > 0 and receipts[0].sequence != 0

        has_cross_system_impact = False
        has_architectural_content = len(goal) > 200 or "architecture" in goal or "design" in goal
        has_structural_content = len(files_affected) > 0

        abstraction_level = determine_abstraction_level(
            current_state,
            has_cross_system_impact,
            has_architectural_content,
            has_structural_content,
        )

        visibility_scope = level_to_visibility_scope(abstraction_level)

        chunks = build_chunks(
            title, goal, files_affected, acceptance_criteria,
            current_state, abstraction_level, visibility_scope,
        )

        cross_refs = build_cross_references(plan_id, dependencies, files_affected, prompt_ref)

        return WRPProjection(
            plan_id=plan_id,
            title=title,
            project=project,
            wrp_state=current_state,
            state_history=state_history,
            applied_receipt_ids=applied_ids,
            total_receipts=len(receipts),
            skipped_receipts=skipped,
            partial=partial,
            incomplete_start=incomplete_start,
            errors=errors,
            abstraction_level=abstraction_level,
            chunks=chunks,
            visibility_scope=visibility_scope,
            cross_references=cross_refs,
            goal=goal,
            files_affected=files_affected,
            acceptance_criteria=acceptance_criteria,
            dependencies=dependencies,
        )
