"""Spec Compiler — Station 3 of the MEEP pipeline.

Rule-based compiler that takes an IRSelection (plus the original prompt)
and produces a small WorkRequestGraph — a directed acyclic graph of work
nodes with explicit dependency edges.

Each archetype has a fixed template DAG.  The compiler instantiates the
template, wires the edges, and returns a connected, acyclic graph.

Design decisions:
  - Templates are frozen per archetype (Phase 0 compliance)
  - DEFAULT produces a single generic node
  - REJECT produces an empty graph (no work to do)
  - All nodes are connected in a linear chain by default for v1.
    Non-linear DAGs can be added in Phase 2 without breaking the contract.
"""

from __future__ import annotations

from typing import Final

from meep.models import (
    IRSelection,
    WorkNode,
    WorkEdge,
    WorkRequestGraph,
)

# ── Archetype DAG templates ──────────────────────────────────────────
# Each entry defines the sequence of work steps for that archetype.
# Steps are connected in order: step_i → step_{i+1} via "depends_on".

Template = list[dict[str, str]]

_TEMPLATES: Final[dict[str, Template]] = {
    "CONSTRUCTION": [
        {"id_suffix": "specify", "label": "Specify"},
        {"id_suffix": "build",   "label": "Build"},
        {"id_suffix": "verify",  "label": "Verify"},
    ],
    "EXECUTION": [
        {"id_suffix": "prepare", "label": "Prepare"},
        {"id_suffix": "execute", "label": "Execute"},
        {"id_suffix": "collect", "label": "Collect results"},
    ],
    "REFLECTION": [
        {"id_suffix": "gather",  "label": "Gather context"},
        {"id_suffix": "analyze", "label": "Analyze"},
        {"id_suffix": "report",  "label": "Document findings"},
    ],
    "RECONCILIATION": [
        {"id_suffix": "identify", "label": "Identify conflicts"},
        {"id_suffix": "propose",  "label": "Propose resolution"},
        {"id_suffix": "apply",    "label": "Apply reconciliation"},
    ],
    "REVISION": [
        {"id_suffix": "identify", "label": "Identify issue"},
        {"id_suffix": "plan",     "label": "Plan change"},
        {"id_suffix": "apply",    "label": "Apply change"},
        {"id_suffix": "verify",   "label": "Verify fix"},
    ],
    "COUNTERFACTUAL": [
        {"id_suffix": "scenario", "label": "Define scenario"},
        {"id_suffix": "explore",  "label": "Explore alternative"},
        {"id_suffix": "compare",  "label": "Compare outcomes"},
    ],
    "AUDIT": [
        {"id_suffix": "collect", "label": "Collect evidence"},
        {"id_suffix": "evaluate","label": "Evaluate compliance"},
        {"id_suffix": "report",  "label": "Report findings"},
    ],
    "COMPRESSION": [
        {"id_suffix": "scan",    "label": "Scan input"},
        {"id_suffix": "extract", "label": "Extract key points"},
        {"id_suffix": "summary", "label": "Produce summary"},
    ],
    "CONSTRAINT_INJECTION": [
        {"id_suffix": "analyze", "label": "Analyze constraints"},
        {"id_suffix": "modify",  "label": "Modify behavior"},
        {"id_suffix": "validate","label": "Validate"},
    ],
    "DEFAULT": [
        {"id_suffix": "clarify", "label": "Clarify intent"},
    ],
}


def compile_selection(selection: IRSelection, prompt: str) -> WorkRequestGraph:
    """Compile an *IRSelection* into a *WorkRequestGraph*.

    Args:
        selection: The deterministic archetype selection.
        prompt: The original raw prompt (stored in metadata).

    Returns:
        A WorkRequestGraph with nodes and edges following the archetype
        template.  Returns an empty graph for REJECT.
    """
    archetype = selection.archetype

    if archetype == "REJECT":
        return WorkRequestGraph(
            metadata={"archetype": "REJECT", "prompt": prompt},
        )

    template = _TEMPLATES.get(archetype, _TEMPLATES["DEFAULT"])
    prefix = archetype.lower()

    nodes: list[WorkNode] = []
    edges: list[WorkEdge] = []

    for i, step in enumerate(template):
        node_id = f"{prefix}-{step['id_suffix']}"
        nodes.append(WorkNode(
            id=node_id,
            label=step["label"],
            archetype=archetype,
        ))
        if i > 0:
            edges.append(WorkEdge(
                source_id=nodes[i - 1].id,
                target_id=node_id,
                relation="depends_on",
            ))

    return WorkRequestGraph(
        nodes=nodes,
        edges=edges,
        metadata={"archetype": archetype, "prompt": prompt},
    )
