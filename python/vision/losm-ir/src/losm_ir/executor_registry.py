from __future__ import annotations

from typing import FrozenSet, List, Literal, Optional

from pydantic import BaseModel, Field


# ── Canonical executor set ────────────────────────────────────────────────────
# The single source of truth for which roles may own/execute DAG nodes in the
# LOSM compile + governance passes. This MUST stay a subset of the canonical
# executor registry (tackle.roles in the WRP path) — the wr-conf-009
# conformance guard asserts that invariant against the live table so the two
# can never silently drift. Roles here are the executor-capable agent roles;
# harness-internal executors (e.g. the T16 watchdog) are deliberately excluded
# because they do not own DAG nodes.
DEFAULT_KNOWN_EXECUTORS: FrozenSet[str] = frozenset({
    "planner", "builder", "reviewer", "analyst",
    "critic", "inspector", "architect", "engineer", "leased-builder",
})


class InvocationContract(BaseModel):
    type: Literal["cli", "http", "module"]
    command: Optional[str] = None
    model_config = {"extra": "allow"}


class ExecutorRegistration(BaseModel):
    executor_id: str
    supports: List[str]
    invocation_contract: InvocationContract
    system_prompt: Optional[str] = None
    model_config = {"extra": "allow"}


class ExecutorRegistry(BaseModel):
    executors: List[ExecutorRegistration] = Field(default_factory=list)
    model_config = {"extra": "allow"}


__all__ = ["ExecutorRegistry"]
