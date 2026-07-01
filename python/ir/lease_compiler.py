"""LeaseCompiler — 5-stage compilation pipeline with PromotionReceipts.

Compiles raw CausalEvents into a fully-formed RoleLease through:
  1. Events → EventProjection  (project)
  2. EventProjection → IntentGraph  (compile_intent)
  3. IntentGraph → PromptIR  (compile_prompt)
  4. PromptIR → RoleLease  (instantiate)
  5. RoleLease → Dispatch  (dispatch — called by LS-IR)

Each stage emits an immutable PromotionReceipt.  The ProvenanceGraph
is the chain of all receipts.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any
import uuid

from .promotion_receipt import PromotionReceipt
from .role_lease import RoleLease, RoleDefinition, CapabilitySet, LeaseStatus
from .role_lease import ExecutionContext, LifecycleModel, TerminationSpec, ObservabilitySpec
from .event_projection import EventProjection
from .intent_graph import IntentGraph
from .prompt_ir import PromptIR
from .provenance_graph import ProvenanceGraph


class LeaseCompiler:
    """Compiles raw events into a RoleLease through a 5-stage pipeline.

    Usage::

        compiler = LeaseCompiler()
        lease, provenance = compiler.compile(events, role)
        print(provenance.trace_backward(lease.lease_id))
    """

    def compile(
        self,
        event_slice: list[Any],  # list[CausalEvent]
        role: RoleDefinition,
        time_range: Any = None,
    ) -> tuple[RoleLease, ProvenanceGraph]:
        """Run the full 5-stage compilation pipeline.

        Args:
            event_slice: Raw CausalEvents to compile.
            role: The RoleDefinition for capability scoping.
            time_range: Optional (start, end) time filter.

        Returns:
            A tuple of (RoleLease, ProvenanceGraph).
        """
        receipts: list[PromotionReceipt] = []

        # ── Stage 1: Events → EventProjection ─────────────────────────

        projection = EventProjection.select(event_slice, role, time_range=time_range)
        receipts.append(PromotionReceipt(
            from_type="CausalEvent",
            from_id=",".join(getattr(e, "event_id", "?") for e in event_slice),
            to_type="EventProjection",
            to_id=projection.projection_id,
            stage="project",
            metadata={
                "event_count": projection.event_count,
                "role": role.role_name,
            },
        ))

        # ── Stage 2: EventProjection → IntentGraph ────────────────────

        intent_graph = IntentGraph.from_events(projection)
        receipts.append(PromotionReceipt(
            from_type="EventProjection",
            from_id=projection.projection_id,
            to_type="IntentGraph",
            to_id=intent_graph.graph_id,
            stage="compile_intent",
            metadata={
                "intent_node_count": len(intent_graph.nodes),
                "role": role.role_name,
            },
        ))

        # ── Stage 3: IntentGraph → PromptIR ───────────────────────────

        prompt_ir = PromptIR.from_intent(intent_graph, role)
        receipts.append(PromotionReceipt(
            from_type="IntentGraph",
            from_id=intent_graph.graph_id,
            to_type="PromptIR",
            to_id=prompt_ir.prompt_id,
            stage="compile_prompt",
            metadata={
                "role": role.role_name,
                "tools": prompt_ir.tools,
            },
        ))

        # ── Stage 4: PromptIR → RoleLease ────────────────────────────

        lease = self.instantiate(prompt_ir, role)
        receipts.append(PromotionReceipt(
            from_type="PromptIR",
            from_id=prompt_ir.prompt_id,
            to_type="RoleLease",
            to_id=lease.lease_id,
            stage="instantiate",
            metadata={
                "capabilities": list(lease.capabilities),
                "role": role.role_name,
            },
        ))

        # ── Build ProvenanceGraph ─────────────────────────────────────

        provenance = ProvenanceGraph.from_receipts(receipts)
        lease = replace(lease, provenance=provenance, projection=projection, prompt_ir=prompt_ir)

        return lease, provenance

    def instantiate(self, prompt_ir: PromptIR, role: RoleDefinition) -> RoleLease:
        """Create a RoleLease from a PromptIR and RoleDefinition.

        This is Stage 4 of the pipeline — the point where intent becomes
        an executable context.
        """
        caps = CapabilitySet(capabilities=frozenset(role.default_capabilities))

        return RoleLease(
            lease_id=str(uuid.uuid4()),
            status=LeaseStatus.PENDING,
            role=role,
            capabilities=caps,
            execution=ExecutionContext(harness="noop"),
            lifecycle=LifecycleModel(),
            termination=TerminationSpec(),
            observability=ObservabilitySpec(),
        )
