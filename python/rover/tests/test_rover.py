"""
Tests for the rover module — Pydantic schemas, AgendaMatch, text builders,
embedding cache key, and event emitter convenience functions.

All tests are pure — no DB, no Ollama, no MCP server needed.
"""

import unittest
import uuid

import pytest

from rover.schemas import HarvestedCode, SpecificationAgenda, SpecificationCandidate
from rover.embed_util import _cache_key, build_candidate_text, CONFIDENCE_ORDER
from rover.agenda_matcher import (
    AgendaMatch,
    _build_ir_text,
    _build_item_text,
)
from rover.event_emitter import (
    emit_harvest_captured,
    emit_candidate_discovered,
    emit_candidate_classified,
    emit_candidate_completed,
    emit_candidate_promoted,
    emit_intent_record_created,
    emit_agenda_created,
    emit_agenda_item_added,
    emit_embedding_created,
    emit_cross_reference_created,
    emit_requirement_promoted_to_plan,
    emit_candidate_assessed,
    emit_question_created,
    emit_ripple_assessed,
    emit_candidate_greenlit,
    emit_candidate_escalated,
)


# ═══════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════


def _u() -> str:
    return str(uuid.uuid4())


# ═══════════════════════════════════════════════════════════════════
#  Pydantic schemas — green + orange + red paths
# ═══════════════════════════════════════════════════════════════════


class TestHarvestedCode:
    """HarvestedCode schema — code snippet with metadata."""

    def test_full_constructor(self):
        """All fields provided."""
        hc = HarvestedCode(language="python", purpose="Test", raw_code="print('hello')")
        assert hc.language == "python"
        assert hc.purpose == "Test"
        assert hc.raw_code == "print('hello')"

    def test_model_dump(self):
        """model_dump() returns correct dict."""
        hc = HarvestedCode(language="python", purpose="Test", raw_code="x = 1")
        d = hc.model_dump()
        assert d["language"] == "python"
        assert d["purpose"] == "Test"
        assert d["raw_code"] == "x = 1"

    def test_empty_strings(self):
        """Empty strings are accepted (orange path)."""
        hc = HarvestedCode(language="", purpose="", raw_code="")
        assert hc.language == ""
        assert hc.purpose == ""

    def test_multiline_raw_code(self):
        """Multi-line code is preserved."""
        code = "def foo():\n    return 42\n"
        hc = HarvestedCode(language="python", purpose="Function", raw_code=code)
        assert hc.raw_code == code
        assert "\n" in hc.raw_code


class TestSpecificationCandidate:
    """SpecificationCandidate schema — full candidate spec."""

    @pytest.fixture
    def minimal_candidate(self):
        return SpecificationCandidate(
            title="Test Feature",
            status="Proposed",
            intent_description="A test.",
            requirements=["Must work"],
            implementation_notes=["Use Python"],
            code_snippets=[],
            open_questions=[],
        )

    def test_minimal(self, minimal_candidate):
        """All required fields with empty lists."""
        assert minimal_candidate.title == "Test Feature"
        assert minimal_candidate.status == "Proposed"
        assert minimal_candidate.code_snippets == []
        assert minimal_candidate.open_questions == []

    def test_with_code_snippets(self):
        """Code snippets list is preserved."""
        snippets = [
            HarvestedCode(language="python", purpose="Demo", raw_code="print(1)"),
            HarvestedCode(language="sql", purpose="Query", raw_code="SELECT 1"),
        ]
        sc = SpecificationCandidate(
            title="Test",
            status="Agreed",
            intent_description="Desc",
            requirements=["Req1"],
            implementation_notes=["Note1"],
            code_snippets=snippets,
            open_questions=[],
        )
        assert len(sc.code_snippets) == 2
        assert sc.code_snippets[0].language == "python"
        assert sc.code_snippets[1].language == "sql"

    def test_long_requirements(self):
        """Multiple requirements are preserved (orange path)."""
        reqs = [f"Requirement {i}" for i in range(10)]
        sc = SpecificationCandidate(
            title="Large",
            status="Proposed",
            intent_description="Desc",
            requirements=reqs,
            implementation_notes=[],
            code_snippets=[],
            open_questions=[],
        )
        assert len(sc.requirements) == 10

    def test_model_dump_includes_all_fields(self, minimal_candidate):
        """model_dump() includes all expected keys."""
        d = minimal_candidate.model_dump()
        assert "title" in d
        assert "status" in d
        assert "intent_description" in d
        assert "requirements" in d
        assert "implementation_notes" in d
        assert "code_snippets" in d
        assert "open_questions" in d

    def test_nested_serialization(self):
        """Nested code_snippets serialize properly."""
        sc = SpecificationCandidate(
            title="Nested",
            status="Proposed",
            intent_description="Test nested serialization",
            requirements=["Req"],
            implementation_notes=["Impl"],
            code_snippets=[
                HarvestedCode(language="bash", purpose="Script", raw_code="echo hi"),
            ],
            open_questions=["Q?"],
        )
        d = sc.model_dump()
        assert d["code_snippets"][0]["language"] == "bash"
        assert d["code_snippets"][0]["raw_code"] == "echo hi"


class TestSpecificationAgenda:
    """SpecificationAgenda schema — collection of candidates."""

    def test_empty_agenda(self):
        """Empty agenda_items list (silent-failure path)."""
        agenda = SpecificationAgenda(agenda_items=[])
        assert agenda.agenda_items == []

    def test_single_item(self):
        """Single candidate in agenda."""
        sc = SpecificationCandidate(
            title="Item",
            status="Agreed",
            intent_description="Desc",
            requirements=["R1"],
            implementation_notes=[],
            code_snippets=[],
            open_questions=[],
        )
        agenda = SpecificationAgenda(agenda_items=[sc])
        assert len(agenda.agenda_items) == 1
        assert agenda.agenda_items[0].title == "Item"

    def test_multiple_items(self):
        """Multiple candidates in agenda."""
        items = [
            SpecificationCandidate(
                title=f"Item {i}",
                status="Proposed",
                intent_description=f"Desc {i}",
                requirements=[],
                implementation_notes=[],
                code_snippets=[],
                open_questions=[],
            )
            for i in range(5)
        ]
        agenda = SpecificationAgenda(agenda_items=items)
        assert len(agenda.agenda_items) == 5
        assert agenda.agenda_items[-1].title == "Item 4"

    def test_model_dump(self):
        """model_dump() serializes the nested structure."""
        sc = SpecificationCandidate(
            title="Dump",
            status="Proposed",
            intent_description="Test dump",
            requirements=["R1"],
            implementation_notes=[],
            code_snippets=[],
            open_questions=[],
        )
        agenda = SpecificationAgenda(agenda_items=[sc])
        d = agenda.model_dump()
        assert len(d["agenda_items"]) == 1
        assert d["agenda_items"][0]["title"] == "Dump"


# ═══════════════════════════════════════════════════════════════════
#  AgendaMatch — pure data class
# ═══════════════════════════════════════════════════════════════════


class TestAgendaMatch:
    """AgendaMatch result class — pure, no DB needed."""

    def test_default_constructor(self):
        """Default values."""
        m = AgendaMatch()
        assert m.agenda_id is None
        assert m.score == 0.0
        assert m.is_new is False
        assert m.skip is False

    def test_matched(self):
        """Matched agenda."""
        m = AgendaMatch(agenda_id="abc-123", score=0.85)
        assert m.agenda_id == "abc-123"
        assert m.score == 0.85
        assert m.is_new is False
        assert m.skip is False

    def test_skip(self):
        """Skip result."""
        m = AgendaMatch(skip=True, score=0.3)
        assert m.skip is True
        assert m.score == 0.3

    def test_is_new(self):
        """New agenda result."""
        m = AgendaMatch(is_new=True, score=0.0)
        assert m.is_new is True
        assert m.skip is False

    def test_repr_matched(self):
        """__repr__ for matched state."""
        m = AgendaMatch(agenda_id="abc-123", score=0.85)
        r = repr(m)
        assert "agenda_id" in r
        assert "0.85" in r

    def test_repr_skip(self):
        """__repr__ for skip state."""
        m = AgendaMatch(skip=True, score=0.3)
        r = repr(m)
        assert "skip" in r
        assert "0.300" in r

    def test_repr_new(self):
        """__repr__ for new state."""
        m = AgendaMatch(is_new=True, score=0.0)
        r = repr(m)
        assert "new" in r

    def test_to_dict_matched(self):
        """to_dict() for matched state."""
        m = AgendaMatch(agenda_id="abc-123", score=0.85)
        d = m.to_dict()
        assert d["agenda_id"] == "abc-123"
        assert d["score"] == 0.85
        assert d["is_new"] is False
        assert d["skip"] is False

    def test_to_dict_skip(self):
        """to_dict() for skip state."""
        m = AgendaMatch(skip=True, score=0.3)
        d = m.to_dict()
        assert d["skip"] is True
        assert d["agenda_id"] is None

    def test_to_dict_new(self):
        """to_dict() for new state."""
        m = AgendaMatch(is_new=True, score=0.0)
        d = m.to_dict()
        assert d["is_new"] is True
        assert d["agenda_id"] is None

    def test_edge_high_score(self):
        """Score can be at or above 1.0 (edge case)."""
        m = AgendaMatch(agenda_id="hi", score=1.0)
        assert m.score == 1.0
        m2 = AgendaMatch(agenda_id="hi2", score=2.5)
        assert m2.score == 2.5

    def test_edge_zero_score_matched(self):
        """Matched with zero score (edge case)."""
        m = AgendaMatch(agenda_id="zero", score=0.0)
        assert m.score == 0.0
        assert m.agenda_id == "zero"


# ═══════════════════════════════════════════════════════════════════
#  Text builders — pure functions
# ═══════════════════════════════════════════════════════════════════


class TestBuildIrText:
    """_build_ir_text — builds text representation of intent records."""

    def test_title_only(self):
        """Only title provided."""
        ir = {"title": "My Feature"}
        result = _build_ir_text(ir)
        assert "My Feature" in result

    def test_title_and_description(self):
        """Title and description."""
        ir = {"title": "Feature", "description": "A great feature"}
        result = _build_ir_text(ir)
        assert "Feature" in result
        assert "A great feature" in result

    def test_with_system(self):
        """System context is included."""
        ir = {"title": "Feature", "description": "", "system_name": "core", "subsystem_name": ""}
        result = _build_ir_text(ir)
        assert "Feature" in result
        assert "system: core" in result

    def test_with_subsystem(self):
        """Subsystem context is included."""
        ir = {"title": "Feature", "description": "", "system_name": "core", "subsystem_name": "auth"}
        result = _build_ir_text(ir)
        assert "system: core" in result
        assert "subsystem: auth" in result

    def test_falls_back_to_intent_description(self):
        """Falls back to intent_description when description is absent."""
        ir = {"title": "Feature", "intent_description": "Intent fallback", "system_name": "", "subsystem_name": ""}
        result = _build_ir_text(ir)
        assert "Intent fallback" in result

    def test_empty_dict(self):
        """Empty dict — no crash."""
        result = _build_ir_text({})
        assert isinstance(result, str)

    def test_missing_keys(self):
        """Missing keys handled gracefully."""
        ir = {"title": "Only Title"}
        result = _build_ir_text(ir)
        assert "Only Title" in result


class TestBuildItemText:
    """_build_item_text — builds text representation of agenda items."""

    def test_title_only(self):
        """Only title provided."""
        item = {"title": "Agenda Item"}
        result = _build_item_text(item)
        assert "Agenda Item" in result

    def test_title_and_body(self):
        """Title and body."""
        item = {"title": "Item", "body": "Item body text"}
        result = _build_item_text(item)
        assert "Item" in result
        assert "Item body text" in result

    def test_empty_body(self):
        """Body is empty."""
        item = {"title": "Item", "body": ""}
        result = _build_item_text(item)
        assert "Item" in result
        assert "\n" not in result.strip()

    def test_missing_body(self):
        """Body key is missing."""
        item = {"title": "Item"}
        result = _build_item_text(item)
        assert "Item" in result

    def test_missing_title(self):
        """Title key is missing — empty title handled."""
        item = {"body": "Body only"}
        result = _build_item_text(item)
        assert "Body only" in result

    def test_empty_dict(self):
        """Empty dict — no crash."""
        result = _build_item_text({})
        assert isinstance(result, str)


# ═══════════════════════════════════════════════════════════════════
#  Embedding cache key — pure function
# ═══════════════════════════════════════════════════════════════════


class TestCacheKey:
    """_cache_key — deterministic SHA-256 based cache filename."""

    def test_deterministic(self):
        """Same text + model produces same key."""
        k1 = _cache_key("hello", "test-model")
        k2 = _cache_key("hello", "test-model")
        assert k1 == k2

    def test_different_text_different_key(self):
        """Different text produces different key."""
        k1 = _cache_key("hello", "test-model")
        k2 = _cache_key("world", "test-model")
        assert k1 != k2

    def test_different_model_different_key(self):
        """Different model produces different key."""
        k1 = _cache_key("hello", "model-a")
        k2 = _cache_key("hello", "model-b")
        assert k1 != k2

    def test_format_includes_model(self):
        """Key format includes model name with underscore separator."""
        k = _cache_key("test", "nomic-embed-text")
        assert k.startswith("nomic-embed-text_")
        assert k.endswith(".npy")

    def test_empty_text(self):
        """Empty string produces valid hash."""
        k = _cache_key("", "model")
        assert isinstance(k, str)
        assert k.endswith(".npy")

    def test_model_with_slash(self):
        """Model with / replaces / with _."""
        k = _cache_key("text", "org/model")
        assert "org_model" in k
        assert "/" not in k

    def test_unicode_text(self):
        """Unicode text is hashed deterministically."""
        k1 = _cache_key("héllo wörld 🚀", "model")
        k2 = _cache_key("héllo wörld 🚀", "model")
        assert k1 == k2

    def test_long_text(self):
        """Long text produces valid key."""
        long_text = "x" * 10000
        k = _cache_key(long_text, "model")
        assert isinstance(k, str)
        assert len(k) > 10
        assert k.endswith(".npy")


# ═══════════════════════════════════════════════════════════════════
#  build_candidate_text — pure function
# ═══════════════════════════════════════════════════════════════════


class TestBuildCandidateText:
    """build_candidate_text — text representation of harvest candidates."""

    def test_title_only(self):
        """Only title provided."""
        text = build_candidate_text({"title": "My Candidate"})
        assert "My Candidate" in text

    def test_with_intent(self):
        """Intent included."""
        text = build_candidate_text({"title": "C", "intent": "The purpose"})
        assert "C" in text
        assert "The purpose" in text

    def test_empty_intent(self):
        """Empty intent — no intent line."""
        text = build_candidate_text({"title": "C", "intent": ""})
        assert "Candidate: C" in text
        # Should not have an Intent: line when intent is empty
        lines = text.split("\n")
        assert len(lines) == 1

    def test_missing_intent(self):
        """Missing intent key — no crash."""
        text = build_candidate_text({"title": "C"})
        assert "Candidate: C" in text

    def test_empty_title(self):
        """Empty title."""
        text = build_candidate_text({"title": ""})
        assert "Candidate:" in text

    def test_empty_dict(self):
        """Empty dict — no crash."""
        text = build_candidate_text({})
        assert isinstance(text, str)


# ═══════════════════════════════════════════════════════════════════
#  CONFIDENCE_ORDER — constant dict
# ═══════════════════════════════════════════════════════════════════


class TestConfidenceOrder:
    """CONFIDENCE_ORDER — constant mapping for min-confidence filtering."""

    def test_has_high(self):
        assert CONFIDENCE_ORDER["high"] == 2

    def test_has_medium(self):
        assert CONFIDENCE_ORDER["medium"] == 1

    def test_has_low(self):
        assert CONFIDENCE_ORDER["low"] == 0

    def test_ordering(self):
        """High > medium > low."""
        assert CONFIDENCE_ORDER["high"] > CONFIDENCE_ORDER["medium"] > CONFIDENCE_ORDER["low"]


# ═══════════════════════════════════════════════════════════════════
#  Event emitter convenience functions — verify correct calling patterns
# ═══════════════════════════════════════════════════════════════════


class TestEventEmitterHelpers:
    """Convenience functions wrap emit_event() with correct defaults."""

    def test_emit_harvest_captured(self):
        """emit_harvest_captured accepts test parameters."""
        with unittest.mock.patch("rover.event_emitter.emit_event") as mock_emit:
            mock_emit.return_value = "evt-001"
            result = emit_harvest_captured(harvest_id="h-001", title="Test Harvest")
            assert result == "evt-001"
            mock_emit.assert_called_once()
            kwargs = mock_emit.call_args[1]
            assert kwargs["event_type"] == "harvest.captured"
            assert kwargs["aggregate_id"] == "h-001"

    def test_emit_candidate_discovered(self):
        """emit_candidate_discovered passes correct parameters."""
        import inspect
        sig = inspect.signature(emit_candidate_discovered)
        params = list(sig.parameters.keys())
        assert "candidate_id" in params
        assert "harvest_id" in params
        assert "title" in params
        assert "cpf" in params

    def test_emit_candidate_classified(self):
        """emit_candidate_classified passes system/subsystem."""
        import inspect
        sig = inspect.signature(emit_candidate_classified)
        params = list(sig.parameters.keys())
        assert "candidate_id" in params
        assert "system_id" in params
        assert "subsystem_id" in params

    def test_emit_candidate_completed(self):
        """emit_candidate_completed has matched_via param."""
        import inspect
        sig = inspect.signature(emit_candidate_completed)
        assert "matched_via" in sig.parameters

    def test_emit_candidate_promoted(self):
        """emit_candidate_promoted has intent_record_id param."""
        import inspect
        sig = inspect.signature(emit_candidate_promoted)
        assert "intent_record_id" in sig.parameters
        assert "from_state" in sig.parameters
        assert "cpf" in sig.parameters

    def test_emit_intent_record_created(self):
        """emit_intent_record_created has causation_id param."""
        import inspect
        sig = inspect.signature(emit_intent_record_created)
        assert "causation_id" in sig.parameters
        assert "source_candidate_id" in sig.parameters

    def test_emit_agenda_created(self):
        """emit_agenda_created has source_count param."""
        import inspect
        sig = inspect.signature(emit_agenda_created)
        assert "source_count" in sig.parameters

    def test_emit_agenda_item_added(self):
        """emit_agenda_item_added has item_id and source_id params."""
        import inspect
        sig = inspect.signature(emit_agenda_item_added)
        assert "item_id" in sig.parameters
        assert "source_id" in sig.parameters
        assert "source_type" in sig.parameters

    def test_emit_embedding_created(self):
        """emit_embedding_created has entity_type/entity_id params."""
        import inspect
        sig = inspect.signature(emit_embedding_created)
        assert "entity_type" in sig.parameters
        assert "entity_id" in sig.parameters
        assert "dimensions" in sig.parameters

    def test_emit_cross_reference_created(self):
        """emit_cross_reference_created has full link params."""
        import inspect
        sig = inspect.signature(emit_cross_reference_created)
        assert "source_type" in sig.parameters
        assert "source_id" in sig.parameters
        assert "target_type" in sig.parameters
        assert "target_id" in sig.parameters
        assert "relationship" in sig.parameters

    def test_emit_requirement_promoted_to_plan(self):
        """emit_requirement_promoted_to_plan has plan_id param."""
        import inspect
        sig = inspect.signature(emit_requirement_promoted_to_plan)
        assert "plan_id" in sig.parameters

    def test_emit_candidate_assessed(self):
        """emit_candidate_assessed has cpf_score/component params."""
        import inspect
        sig = inspect.signature(emit_candidate_assessed)
        assert "cpf_score" in sig.parameters
        assert "components" in sig.parameters
        assert "promotable" in sig.parameters

    def test_emit_question_created(self):
        """emit_question_created has category/title params."""
        import inspect
        sig = inspect.signature(emit_question_created)
        assert "category" in sig.parameters
        assert "candidate_id" in sig.parameters
        assert "requirement_id" in sig.parameters

    def test_emit_ripple_assessed(self):
        """emit_ripple_assessed has risk_level/blast_radius params."""
        import inspect
        sig = inspect.signature(emit_ripple_assessed)
        assert "risk_level" in sig.parameters
        assert "blast_radius" in sig.parameters

    def test_emit_candidate_greenlit(self):
        """emit_candidate_greenlit has cpf_score/risk_level params."""
        import inspect
        sig = inspect.signature(emit_candidate_greenlit)
        assert "cpf_score" in sig.parameters
        assert "risk_level" in sig.parameters

    def test_emit_candidate_escalated(self):
        """emit_candidate_escalated has reason param."""
        import inspect
        sig = inspect.signature(emit_candidate_escalated)
        assert "reason" in sig.parameters
