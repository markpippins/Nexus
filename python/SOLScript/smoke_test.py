#!/usr/bin/env python3
"""Smoke test — wire DatabaseLoader to the live resolution DB."""

from __future__ import annotations

import asyncio
import sys
from typing import Any

import asyncpg

from solscript import ResolutionInterpreter
from solscript.database_loader import DatabaseLoader

DSN = "postgresql://pguser:pgpass@localhost:5432/nexus"


async def main() -> None:
    print("Connecting to resolution DB ...")
    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=5)

    interp = ResolutionInterpreter()
    loader = DatabaseLoader(interp, pool)

    # ── Load everything ──────────────────────────────────────────
    print("Loading concepts ...")
    await loader.load_concepts()
    print(f"  → {len(interp.concepts)} concepts")

    print("Loading attributes ...")
    await loader.load_attributes()
    attr_count = sum(len(c.attributes) for c in interp.concepts.values())
    print(f"  → {attr_count} attributes across concepts")

    print("Loading relationships ...")
    await loader.load_relationships()
    rel_count = sum(len(c.relationships) for c in interp.concepts.values())
    print(f"  → {rel_count} relationships")

    print("Loading expressions ...")
    await loader.load_expressions()
    print(f"  → {len(interp.expressions)} expressions")

    print("Loading rules ...")
    await loader.load_rules()
    inv_count = sum(len(c.invariants) for c in interp.concepts.values())
    deriv_count = sum(len(c.derivations) for c in interp.concepts.values())
    print(f"  → {len(interp.rules)} rules ({inv_count} invariants, {deriv_count} derivations)")

    print("Loading propositions ...")
    await loader.load_propositions()
    print(f"  → {len(interp.propositions)} propositions")

    print("Loading entities (resolution schema only) ...")
    await loader.load_entities()
    print(f"  → {len(interp.entities)} entities")

    await pool.close()

    # ── Verify loaded state ──────────────────────────────────────
    print("\n=== Smoke Test Results ===\n")

    errors: list[str] = []

    # 1. Concepts loaded
    if len(interp.concepts) == 0:
        errors.append("FAIL: No concepts loaded")
    else:
        names = sorted(c.name for c in interp.concepts.values())
        print(f"Concepts ({len(names)}): {', '.join(names[:10])}{' ...' if len(names) > 10 else ''}")

    # 2. Attributes wired to concepts
    if attr_count == 0:
        errors.append("FAIL: No attributes loaded")
    else:
        print(f"Attributes: {attr_count} total")
        for c in interp.concepts.values():
            if c.attributes:
                attr_names = [a.name for a in c.attributes.values()]
                print(f"  {c.name}: {', '.join(attr_names)}")

    # 3. Relationships wired
    if rel_count > 0:
        print(f"\nRelationships: {rel_count} total")
        for c in interp.concepts.values():
            for r in c.relationships.values():
                from_name = interp.get_concept(r.from_concept_id)
                to_name = interp.get_concept(r.to_concept_id)
                print(f"  {from_name.name if from_name else '?'} →{r.relationship_type}→ {to_name.name if to_name else '?'}")

    # 4. Expressions compiled
    if len(interp.expressions) == 0:
        errors.append("FAIL: No expressions loaded")
    else:
        print(f"\nExpressions: {len(interp.expressions)} loaded")
        # Check expression tree integrity
        broken = 0
        for expr in interp.expressions.values():
            for child in expr.operands:
                if child.id not in interp.expressions and child.id != "placeholder":
                    broken += 1
        if broken:
            print(f"  WARNING: {broken} broken operand references")
        else:
            print("  Expression tree integrity: OK")

    # 5. Rules linked
    if len(interp.rules) == 0:
        errors.append("FAIL: No rules loaded")
    else:
        print(f"\nRules: {len(interp.rules)} total")
        for r in interp.rules.values():
            concept = interp.get_concept(r.concept_id) if r.concept_id else None
            print(f"  [{r.rule_type.value}] {r.name} → {concept.name if concept else 'relationship/transition'}")

    # 6. Propositions loaded
    if len(interp.propositions) > 0:
        print(f"\nPropositions: {len(interp.propositions)} total")
        for p in interp.propositions.values():
            print(f"  [{p.disposition.value}] {p.title[:70]}")

    # 7. Entities loaded
    if len(interp.entities) == 0:
        errors.append("FAIL: No entities loaded")
    else:
        print(f"\nEntities: {len(interp.entities)} total")
        # Group by concept
        by_concept: dict[str, int] = {}
        for e in interp.entities.values():
            c = interp.get_concept(e.concept_id)
            name = c.name if c else e.concept_id
            by_concept[name] = by_concept.get(name, 0) + 1
        for name, count in sorted(by_concept.items()):
            print(f"  {name}: {count}")

    # 8. Run invariant checks on a sample entity
    print(f"\n=== Invariant Check (sample) ===")
    sample_entities = list(interp.entities.values())[:3]
    for entity in sample_entities:
        concept = interp.get_concept(entity.concept_id)
        if not concept or not concept.invariants:
            continue
        print(f"\nEntity: {entity.id} ({concept.name})")
        for rule in concept.invariants[:3]:
            passed, reason = interp.check_rule(rule, entity)
            status = "PASS" if passed else "FAIL"
            print(f"  [{status}] {rule.name}: {reason}")

    # ── Summary ──────────────────────────────────────────────────
    print(f"\n{'='*50}")
    if errors:
        for e in errors:
            print(f"  {e}")
        print(f"\nSMOKE TEST: FAILED ({len(errors)} errors)")
        sys.exit(1)
    else:
        print("  All checks passed")
        print(f"\nSMOKE TEST: PASSED")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
