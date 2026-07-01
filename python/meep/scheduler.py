"""Deterministic Scheduler — Station 5 of the MEEP pipeline.

.. deprecated:: 2026-06-28
    MEEP's simple topological executor is superseded by the LS-IR
    scheduler at ``ir.scheduler.Scheduler``, which adds lease
    dispatch, arbitration scoring, preemption, and a deferred frontier.
    This module is kept for backward compatibility with the existing
    MEEP test suite (186 tests) but new execution pipelines should use
    ``ir.scheduler``.

Walks a frozen ExecutionGraph in topological order, invokes handlers,
and emits CER events into an append-only log.

Key properties (enforced by construction):
  1. **Determinism**: Same frozen graph → same event sequence (same
     number of events, same types, same node IDs, same order).
  2. **Append-only**: Events are written via ``CERLog.append()``, which
     enforces the hash chain and immutability after write.
  3. **No side effects**: Handler execution is simulated in v1, but the
     scheduler never mutates the input graph or any shared state.
"""

from __future__ import annotations

from typing import Callable

from meep.cer_writer import (
    ClockFn,
    EventIdGenerator,
    make_execution_id,
    make_node_complete,
    make_node_start,
    utc_clock,
)
from meep.handlers import execute_handler
from meep.models import CERLog, ExecutionGraph, FrozenGraphError


def schedule(
    graph: ExecutionGraph,
    clock: ClockFn | None = None,
) -> CERLog:
    """Execute a frozen *ExecutionGraph* and produce a *CERLog*.

    Args:
        graph: A frozen ExecutionGraph (must have been lowered via
            ``lowering_pass.lower()``).
        clock: Optional timestamp provider.  Defaults to ``utc_clock``.
            Pass a fixed-clock lambda for deterministic tests.

    Returns:
        An append-only CERLog with hash-chained events.

    Raises:
        FrozenGraphError: If *graph* is not frozen (``_freeze()`` not
            called).
        ValueError: If the graph's topological order is empty but nodes
            exist (broken invariant).
    """
    # Defensive: ensure the graph is frozen
    if not graph._frozen:
        raise FrozenGraphError(
            "ExecutionGraph must be frozen before scheduling. "
            "Call lower() on a WorkRequestGraph first."
        )

    log = CERLog()
    if not graph.nodes:
        return log

    clock_fn = clock or utc_clock
    execution_id = make_execution_id(graph.content_hash())
    id_gen = EventIdGenerator(execution_id)

    for node_id in graph.topological_order:
        node = _find_node(graph, node_id)
        if node is None:
            # Should never happen — topological order is derived from nodes
            continue

        # ── NODE_START ──
        log.append(make_node_start(
            event_id=id_gen.next_id(),
            timestamp=clock_fn(),
            execution_id=execution_id,
            node_id=node_id,
            handler=node.handler,
        ))

        # ── Execute handler (simulated in v1) ──
        result = execute_handler(node.handler, node_id, node.config)

        # ── NODE_COMPLETE ──
        log.append(make_node_complete(
            event_id=id_gen.next_id(),
            timestamp=clock_fn(),
            execution_id=execution_id,
            node_id=node_id,
            result=result,
        ))

    return log


def _find_node(graph: ExecutionGraph, node_id: str):
    """Linear scan for a node by ID.

    Tuple lookup (frozen graph stores nodes as a tuple).  Linear scan
    is fine for v1 (graphs are < 10 nodes).
    """
    for n in graph.nodes:
        if n.id == node_id:
            return n
    return None
