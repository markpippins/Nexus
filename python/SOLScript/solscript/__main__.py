"""SOLScript — run a built-in example.

Usage::

    python -m solscript
"""

from __future__ import annotations

import uuid
from datetime import datetime

from . import (
    Concept,
    ConceptAttribute,
    Disposition,
    Entity,
    Expression,
    ExpressionKind,
    Operator,
    Proposition,
    ResolutionInterpreter,
    Rule,
    RuleType,
    Severity,
)
from .reasoning import DeterministicPatternLibrary, HybridReasoner


class _MockLLM:
    """Mock LLM client for the example."""

    def generate(self, prompt: str) -> str:  # noqa: ARG002
        return '{"priority": "High", "risk_level": "Medium", "estimated_complexity": "Moderate"}'


def _build_example_interpreter() -> ResolutionInterpreter:
    interp = ResolutionInterpreter()

    # Create a WorkRequest concept
    wr_concept = Concept(
        id=str(uuid.uuid4()),
        name="WorkRequest",
        description="A work request entity",
    )
    interp.add_concept(wr_concept)

    # Status attribute (state attribute)
    status_attr = ConceptAttribute(
        id=str(uuid.uuid4()),
        concept_id=wr_concept.id,
        name="status",
        description="Current status",
        value_type="text",
        is_state_attribute=True,
        allowed_values=["DRAFT", "APPROVED", "DISPATCHED", "COMPLETED", "CANCELLED"],
    )
    wr_concept.attributes[status_attr.id] = status_attr

    # Title attribute
    title_attr = ConceptAttribute(
        id=str(uuid.uuid4()),
        concept_id=wr_concept.id,
        name="title",
        description="Title of the work request",
        value_type="text",
        is_state_attribute=False,
    )
    wr_concept.attributes[title_attr.id] = title_attr

    # Invariant: status must not be null
    invariant_expr = Expression(
        id=str(uuid.uuid4()),
        kind=ExpressionKind.ATTRIBUTE_REF,
        return_type="text",
        attribute_id=status_attr.id,
    )
    invariant_rule = Rule(
        id=str(uuid.uuid4()),
        name="Status must not be null",
        rule_type=RuleType.INVARIANT,
        expression=invariant_expr,
        severity=Severity.HARD,
        concept_id=wr_concept.id,
    )
    wr_concept.invariants.append(invariant_rule)
    interp.rules[invariant_rule.id] = invariant_rule

    # Add a test entity
    entity = interp.add_entity_by_concept_name(
        "WorkRequest",
        {"status": "DRAFT", "title": "Fix bug #123"},
        external_id="WR-001",
    )

    # Create a proposition
    prop = Proposition(
        id=str(uuid.uuid4()),
        title="WorkRequest is valid",
        description="All invariants hold",
        asset_concept_id=wr_concept.id,
        subject_entity_id=entity.id,
        disposition=Disposition.PENDING,
        assertions=[invariant_rule],
    )
    interp.add_proposition(prop)

    return interp


def main() -> None:
    interp = _build_example_interpreter()

    print("=== SOLScript Example ===\n")

    # Evaluate proposition
    prop = list(interp.propositions.values())[0]
    result = interp.evaluate_proposition(prop)
    print(f"Proposition evaluation: {result}")

    # Change event
    entity = list(interp.entities.values())[0]
    entity.attributes["status"] = "APPROVED"
    changes = interp.on_change("WorkRequest", entity.id)
    print(f"Change events: {len(changes)} proposition updates")

    # Invariant check
    concept = interp.get_concept_by_name("WorkRequest")
    if concept:
        for rule in concept.invariants:
            passed, reason = interp.check_rule(rule, entity)
            print(f"Invariant '{rule.name}': {reason}")

    # Hybrid reasoning
    print("\n--- Hybrid Reasoning ---")
    hybrid = HybridReasoner(interp, _MockLLM())
    ctx = {"entity": entity}
    rr = hybrid.reason(ctx)
    unknowns = rr.get("__unknowns", [])
    needs_llm = rr.get("__needs_llm", False)
    print(f"Unknowns: {unknowns}")
    print(f"Needs LLM: {needs_llm}")
    for k, v in rr.items():
        if not k.startswith("__"):
            print(f"  {k}: {v}")

    # Deterministic pattern library
    print("\n--- Pattern Library ---")
    lib = DeterministicPatternLibrary(interp)
    for pat in lib.patterns:
        if pat.priority >= 85:
            r, conf = pat.apply({"entity": entity})
            if r:
                print(f"  [{pat.name}] {r} (conf: {conf:.2f})")

    print("\nDone.")


if __name__ == "__main__":
    main()
