#!/usr/bin/env python3
"""Benchmark — load full resolution schema, compile expressions, run all invariants."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import asyncpg

from solscript import ResolutionInterpreter
from solscript.database_loader import DatabaseLoader

DSN = "postgresql://pguser:pgpass@localhost:5432/nexus"


class Timer:
    """Simple wall-clock timer."""

    def __init__(self) -> None:
        self._start: float = 0.0
        self._laps: list[tuple[str, float]] = []

    def start(self) -> None:
        self._start = time.perf_counter()

    def lap(self, label: str) -> None:
        elapsed = time.perf_counter() - self._start
        self._laps.append((label, elapsed))
        self._start = time.perf_counter()

    def report(self) -> list[tuple[str, float]]:
        return list(self._laps)

    def total(self) -> float:
        return sum(t for _, t in self._laps)


async def benchmark_load(interp: ResolutionInterpreter, pool: Any) -> list[tuple[str, float]]:
    """Benchmark each phase of DatabaseLoader.load_all individually."""
    loader = DatabaseLoader(interp, pool)
    timer = Timer()

    timer.start()
    await loader.load_concepts()
    timer.lap("load_concepts")

    await loader.load_attributes()
    timer.lap("load_attributes")

    await loader.load_relationships()
    timer.lap("load_relationships")

    await loader.load_expressions()
    timer.lap("load_expressions")

    await loader.load_rules()
    timer.lap("load_rules")

    await loader.load_propositions()
    timer.lap("load_propositions")

    await loader.load_entities()
    timer.lap("load_entities")

    return timer.report()


def benchmark_compile(interp: ResolutionInterpreter) -> float:
    """Benchmark: compile all expressions via ExpressionCompiler."""
    from solscript.expression_compiler import ExpressionCompiler

    compiler = ExpressionCompiler(interp)
    t0 = time.perf_counter()
    for expr_id, expr in interp.expressions.items():
        try:
            compiler.compile_expression(expr)
        except Exception:
            pass  # Some expressions may reference missing data — don't count as error
    return time.perf_counter() - t0


def benchmark_compile_cache_hit(interp: ResolutionInterpreter) -> float:
    """Benchmark: re-compile same expressions (cache hits)."""
    from solscript.expression_compiler import ExpressionCompiler

    compiler = ExpressionCompiler(interp)
    # First pass — populate cache
    for expr in interp.expressions.values():
        try:
            compiler.compile_expression(expr)
        except Exception:
            pass

    # Second pass — all cache hits
    t0 = time.perf_counter()
    for expr in interp.expressions.values():
        try:
            compiler.compile_expression(expr)
        except Exception:
            pass
    return time.perf_counter() - t0


def benchmark_invariants(interp: ResolutionInterpreter) -> dict[str, Any]:
    """Benchmark: run all invariants against all matching entities."""
    # Group entities by concept
    entities_by_concept: dict[str, list] = {}
    for entity in interp.entities.values():
        entities_by_concept.setdefault(entity.concept_id, []).append(entity)

    # Collect all invariants
    all_invariants = []
    for concept in interp.concepts.values():
        for rule in concept.invariants:
            all_invariants.append((concept, rule))

    # Benchmark: individual check_rule calls
    t0 = time.perf_counter()
    checks = 0
    passed = 0
    failed = 0
    errors = 0
    results_detail: list[dict[str, Any]] = []

    for concept, rule in all_invariants:
        entities = entities_by_concept.get(concept.id, [])
        for entity in entities:
            try:
                ok, reason = interp.check_rule(rule, entity)
                checks += 1
                if ok:
                    passed += 1
                else:
                    failed += 1
                results_detail.append({
                    "concept": concept.name,
                    "rule": rule.name,
                    "entity_id": entity.id,
                    "passed": ok,
                    "reason": reason,
                })
            except Exception as exc:
                checks += 1
                errors += 1
                results_detail.append({
                    "concept": concept.name,
                    "rule": rule.name,
                    "entity_id": entity.id,
                    "passed": False,
                    "reason": f"ERROR: {exc}",
                })
    invariant_time = time.perf_counter() - t0

    # Benchmark: check all entities for a concept (including no-invariant concepts)
    t0_all = time.perf_counter()
    all_entity_checks = 0
    for concept in interp.concepts.values():
        entities = entities_by_concept.get(concept.id, [])
        for rule in concept.invariants:
            for entity in entities:
                try:
                    interp.check_rule(rule, entity)
                    all_entity_checks += 1
                except Exception:
                    all_entity_checks += 1
    all_entities_time = time.perf_counter() - t0_all

    return {
        "invariant_time_s": invariant_time,
        "all_entities_time_s": all_entities_time,
        "checks": checks,
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "invariants_count": len(all_invariants),
        "entities_with_invariants": sum(
            len(entities_by_concept.get(c.id, []))
            for c in interp.concepts.values()
            if c.invariants
        ),
        "checks_per_second": checks / invariant_time if invariant_time > 0 else 0,
        "results": results_detail,
    }


async def main() -> None:
    print("=" * 60)
    print("  SOLScript Benchmark — Full Schema + Invariant Sweep")
    print("=" * 60)

    pool = await asyncpg.create_pool(DSN, min_size=1, max_size=5)
    interp = ResolutionInterpreter()

    # ── Phase 1: Schema load ─────────────────────────────────────
    print("\n▸ Phase 1: Schema load\n")
    load_results = await benchmark_load(interp, pool)
    await pool.close()

    total_load = 0.0
    for label, elapsed in load_results:
        total_load += elapsed
        print(f"  {label:<25s} {elapsed*1000:8.1f} ms")
    print(f"  {'─'*35}")
    print(f"  {'TOTAL LOAD':<25s} {total_load*1000:8.1f} ms")

    # ── Phase 2: Expression compilation ──────────────────────────
    print(f"\n▸ Phase 2: Expression compilation")
    print(f"  Expressions: {len(interp.expressions)}")

    compile_time = benchmark_compile(interp)
    print(f"  First compile:    {compile_time*1000:8.1f} ms  "
          f"({len(interp.expressions) / compile_time:.0f} expr/s)")

    cache_time = benchmark_compile_cache_hit(interp)
    print(f"  Cache-hit recompile: {cache_time*1000:8.1f} ms  "
          f"({len(interp.expressions) / cache_time:.0f} expr/s)")

    # ── Phase 3: Invariant checks ───────────────────────────────
    print(f"\n▸ Phase 3: Invariant checks\n")

    inv = benchmark_invariants(interp)

    # Summary
    print(f"  Invariants:       {inv['invariants_count']}")
    print(f"  Entities:         {len(interp.entities)} total")
    print(f"  Entities w/rules: {inv['entities_with_invariants']}")
    print(f"  Checks performed: {inv['checks']}")
    print(f"  Passed:           {inv['passed']}")
    print(f"  Failed:           {inv['failed']}")
    print(f"  Errors:           {inv['errors']}")
    print(f"  Time:             {inv['invariant_time_s']*1000:.1f} ms")
    print(f"  Throughput:       {inv['checks_per_second']:.0f} checks/s")

    # Detail per invariant
    print(f"\n  Per-invariant breakdown:")
    seen_rules: dict[str, dict] = {}
    for r in inv["results"]:
        key = f"{r['concept']}.{r['rule']}"
        if key not in seen_rules:
            seen_rules[key] = {"passed": 0, "failed": 0, "errors": 0}
        if "ERROR" in r["reason"]:
            seen_rules[key]["errors"] += 1
        elif r["passed"]:
            seen_rules[key]["passed"] += 1
        else:
            seen_rules[key]["failed"] += 1

    for rule_key, counts in seen_rules.items():
        total = counts["passed"] + counts["failed"] + counts["errors"]
        status = "✓" if counts["failed"] == 0 and counts["errors"] == 0 else "✗"
        print(f"    {status} {rule_key:<55s}  "
              f"{counts['passed']}/{total} passed"
              + (f"  {counts['errors']} errors" if counts["errors"] else "")
              + (f"  {counts['failed']} failed" if counts["failed"] else ""))

    # ── Phase 4: Entity load from data tables ────────────────────
    print(f"\n▸ Phase 4: Entity data table scan\n")
    entity_count = len(interp.entities)
    attr_total = sum(len(e.attributes) for e in interp.entities.values())
    print(f"  Entities loaded:    {entity_count}")
    print(f"  Total attributes:   {attr_total}")
    print(f"  Avg attrs/entity:   {attr_total / entity_count:.1f}" if entity_count else "")

    # ── Grand total ──────────────────────────────────────────────
    grand_total = total_load + compile_time + inv["invariant_time_s"]
    print(f"\n{'=' * 60}")
    print(f"  GRAND TOTAL: {grand_total*1000:.1f} ms")
    print(f"    Load:     {total_load*1000:.1f} ms  ({total_load/grand_total*100:.0f}%)")
    print(f"    Compile:  {compile_time*1000:.1f} ms  ({compile_time/grand_total*100:.0f}%)")
    print(f"    Invariant:{inv['invariant_time_s']*1000:.1f} ms  ({inv['invariant_time_s']/grand_total*100:.0f}%)")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    asyncio.run(main())
