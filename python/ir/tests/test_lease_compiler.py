"""Tests for RL-IR LeaseCompiler (5-stage pipeline) and ProvenanceGraph."""

import pytest
from datetime import datetime, timezone

from ir.lease_compiler import LeaseCompiler
from ir.role_lease import RoleDefinition, LeaseStatus
from ir.provenance_graph import ProvenanceGraph
from ir.promotion_receipt import PromotionReceipt


class FakeCausalEvent:
    def __init__(self, event_id: str, event_type: str = "NODE_START", timestamp: str | None = None, payload: dict | None = None):
        self.event_id = event_id
        self.event_type = event_type
        self.timestamp = timestamp or datetime.now(timezone.utc).isoformat()
        self.payload = payload or {}


class TestLeaseCompiler:
    def test_compile_empty_events(self):
        compiler = LeaseCompiler()
        role = RoleDefinition(role_name="builder")
        lease, provenance = compiler.compile([], role)
        assert lease.status == LeaseStatus.PENDING
        assert lease.role.role_name == "builder"

    def test_compile_with_events(self):
        events = [
            FakeCausalEvent("e1", "NODE_START", payload={"handler": "build"}),
            FakeCausalEvent("e2", "NODE_COMPLETE", payload={"result": "ok"}),
        ]
        compiler = LeaseCompiler()
        role = RoleDefinition(role_name="builder", default_capabilities={"read", "write"})
        lease, provenance = compiler.compile(events, role)

        assert lease.status == LeaseStatus.PENDING
        assert lease.role.role_name == "builder"
        assert "write" in lease.capabilities

    def test_pipeline_emits_four_receipts(self):
        """5-stage pipeline: project, compile_intent, compile_prompt, instantiate.
        (dispatch is stage 5, emitted by LS-IR)."""
        events = [FakeCausalEvent("e1")]
        compiler = LeaseCompiler()
        role = RoleDefinition(role_name="architect")
        lease, provenance = compiler.compile(events, role)

        assert provenance.stage_count == 4
        stages = [r.stage for r in provenance.receipts]
        assert stages == ["project", "compile_intent", "compile_prompt", "instantiate"]

    def test_provenance_has_projection_and_prompt(self):
        events = [FakeCausalEvent("e1")]
        compiler = LeaseCompiler()
        role = RoleDefinition(role_name="builder")
        lease, provenance = compiler.compile(events, role)

        assert lease.projection is not None
        assert lease.prompt_ir is not None
        assert lease.provenance is not None

    def test_deterministic_compilation(self):
        events = [FakeCausalEvent("e1", payload={"result": "ok"})]
        role = RoleDefinition(role_name="builder")

        lease1, prov1 = LeaseCompiler().compile(events, role)
        lease2, prov2 = LeaseCompiler().compile(events, role)

        assert prov1.stage_count == prov2.stage_count
        for r1, r2 in zip(prov1.receipts, prov2.receipts):
            assert r1.stage == r2.stage


class TestProvenanceGraph:
    def test_empty_graph(self):
        pg = ProvenanceGraph()
        assert pg.stage_count == 0

    def test_from_receipts(self):
        receipts = [
            PromotionReceipt(
                from_type="CausalEvent", from_id="e1",
                to_type="EventProjection", to_id="proj-1",
                stage="project",
            ),
            PromotionReceipt(
                from_type="EventProjection", from_id="proj-1",
                to_type="IntentGraph", to_id="graph-1",
                stage="compile_intent",
            ),
            PromotionReceipt(
                from_type="IntentGraph", from_id="graph-1",
                to_type="PromptIR", to_id="prompt-1",
                stage="compile_prompt",
            ),
            PromotionReceipt(
                from_type="PromptIR", from_id="prompt-1",
                to_type="RoleLease", to_id="lease-1",
                stage="instantiate",
            ),
        ]
        pg = ProvenanceGraph.from_receipts(receipts)
        assert pg.stage_count == 4

    def test_trace_backward(self):
        receipts = [
            PromotionReceipt(from_type="E", from_id="e1", to_type="P", to_id="p1", stage="s1"),
            PromotionReceipt(from_type="P", from_id="p1", to_type="L", to_id="l1", stage="s2"),
        ]
        pg = ProvenanceGraph.from_receipts(receipts)
        trace = pg.trace_backward("l1")
        assert len(trace) == 2
        assert trace[0].stage == "s1"
        assert trace[1].stage == "s2"

    def test_trace_forward(self):
        receipts = [
            PromotionReceipt(from_type="E", from_id="e1", to_type="P", to_id="p1", stage="s1"),
            PromotionReceipt(from_type="P", from_id="p1", to_type="L", to_id="l1", stage="s2"),
        ]
        pg = ProvenanceGraph.from_receipts(receipts)
        trace = pg.trace_forward("e1")
        assert len(trace) == 2

    def test_serialization_roundtrip(self):
        receipts = [
            PromotionReceipt(from_type="E", from_id="e1", to_type="L", to_id="l1", stage="test"),
        ]
        pg = ProvenanceGraph.from_receipts(receipts)
        d = pg.to_dict()
        pg2 = ProvenanceGraph.from_dict(d)
        assert pg2.stage_count == 1
