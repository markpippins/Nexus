"""RoleLease — the fundamental unit of work in the IR system.

A RoleLease is an ephemeral, role-bound, capability-scoped execution
context.  It is the result of a 5-stage compilation pipeline applied to
raw event data.  Not a subtype of NBK's Lease — a promoted representation.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any
import uuid

from .promotion_receipt import PromotionReceipt
from .causal_event import CausalEvent


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── LeaseStatus ───────────────────────────────────────────────────────


class LeaseStatus(str, Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    PREEMPTED = "PREEMPTED"
    EXPIRED = "EXPIRED"


# ── RoleDefinition ────────────────────────────────────────────────────


@dataclass(frozen=True)
class RoleDefinition:
    """Defines what a role can do and what capabilities it has by default."""

    role_name: str
    allowed_actions: list[str] = field(default_factory=list)
    default_capabilities: set[str] = field(default_factory=set)


# ── CapabilitySet ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class CapabilitySet:
    """A set of capability strings with set operations."""

    capabilities: frozenset[str] = field(default_factory=frozenset)

    @classmethod
    def of(cls, *caps: str) -> "CapabilitySet":
        return cls(capabilities=frozenset(caps))

    def union(self, other: "CapabilitySet") -> "CapabilitySet":
        return CapabilitySet(capabilities=self.capabilities | other.capabilities)

    def intersection(self, other: "CapabilitySet") -> "CapabilitySet":
        return CapabilitySet(capabilities=self.capabilities & other.capabilities)

    def difference(self, other: "CapabilitySet") -> "CapabilitySet":
        return CapabilitySet(capabilities=self.capabilities - other.capabilities)

    def has(self, capability: str) -> bool:
        return capability in self.capabilities

    def __contains__(self, item: str) -> bool:
        return item in self.capabilities

    def __iter__(self):
        return iter(self.capabilities)

    def __len__(self) -> int:
        return len(self.capabilities)

    def __bool__(self) -> bool:
        return True  # empty set is still a valid capability set

    def to_dict(self) -> dict:
        return {"capabilities": sorted(self.capabilities)}

    @classmethod
    def from_dict(cls, d: dict) -> "CapabilitySet":
        return cls(capabilities=frozenset(d.get("capabilities", [])))


# ── ExecutionHarness ──────────────────────────────────────────────────


class ExecutionHarness(ABC):
    """Abstract interface for lease execution.

    v1: NoopHarness only.  Real harnesses (CLI, LLM, subprocess) are
    follow-up plans.
    """

    @abstractmethod
    def execute(self, lease: "RoleLease", prompt: Any) -> "LeaseResult":
        ...


class NoopHarness(ExecutionHarness):
    """A harness that returns a placeholder result (v1 default)."""

    def execute(self, lease: "RoleLease", prompt: Any) -> "LeaseResult":
        return LeaseResult(
            lease_id=lease.lease_id,
            status=LeaseStatus.COMPLETED,
            output={"placeholder": True},
            events_emitted=[],
            state_mutations=[],
            duration_ms=0,
        )


# ── LeaseResult ───────────────────────────────────────────────────────


@dataclass(frozen=True)
class LeaseResult:
    """The result of executing a RoleLease."""

    lease_id: str
    status: LeaseStatus
    output: Any = None
    events_emitted: list[Any] = field(default_factory=list)  # list[CausalEvent]
    state_mutations: list[dict[str, Any]] = field(default_factory=list)
    duration_ms: float = 0.0
    error: str | None = None


# ── TerminationSpec ───────────────────────────────────────────────────


@dataclass(frozen=True)
class TerminationSpec:
    """Defines cleanup behavior when a lease terminates."""

    on_complete: str = "release"     # "release" | "archive" | "replay"
    on_failure: str = "retain"       # "retain" | "discard" | "replay"
    on_preempt: str = "requeue"      # "requeue" | "discard"
    cleanup_events: bool = True


# ── ObservabilitySpec ─────────────────────────────────────────────────


@dataclass(frozen=True)
class ObservabilitySpec:
    """Defines logging and metrics for a lease."""

    log_level: str = "info"
    metrics_enabled: bool = True
    trace_enabled: bool = True
    tags: list[str] = field(default_factory=list)


# ── LifecycleModel ────────────────────────────────────────────────────


@dataclass(frozen=True)
class LifecycleModel:
    """Timeout, retry, and TTL configuration for a lease."""

    timeout_seconds: float = 300.0
    max_retries: int = 3
    ttl_seconds: float | None = None  # None = no TTL
    created_at: datetime = field(default_factory=_utc_now)


# ── ExecutionContext ──────────────────────────────────────────────────


@dataclass(frozen=True)
class ExecutionContext:
    """Runtime harness configuration for a lease."""

    harness: str = "noop"  # "noop" | "cli" | "llm" | "subprocess"
    harness_config: dict[str, Any] = field(default_factory=dict)
    work_dir: str = ""
    env: dict[str, str] = field(default_factory=dict)


# ── RoleLease ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class RoleLease:
    """An ephemeral, role-bound, capability-scoped execution context.

    The fundamental unit of work — not a subtype of NBK's Lease, but a
    promoted representation produced by the LeaseCompiler pipeline.
    """

    lease_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: LeaseStatus = LeaseStatus.PENDING
    projection: Any = None  # EventProjection (set by compiler)
    prompt_ir: Any = None   # PromptIR (set by compiler)
    role: RoleDefinition = field(default_factory=lambda: RoleDefinition(role_name="unknown"))
    capabilities: CapabilitySet = field(default_factory=CapabilitySet)
    execution: ExecutionContext = field(default_factory=ExecutionContext)
    constraints: Any = None  # ConstraintSet (set by compiler)
    lifecycle: LifecycleModel = field(default_factory=LifecycleModel)
    termination: TerminationSpec = field(default_factory=TerminationSpec)
    observability: ObservabilitySpec = field(default_factory=ObservabilitySpec)
    provenance: Any = None   # ProvenanceGraph (set by compiler)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        d["capabilities"] = self.capabilities.to_dict()["capabilities"]
        d["role"] = asdict(self.role)
        d["execution"] = asdict(self.execution)
        d["lifecycle"] = asdict(self.lifecycle)
        if self.lifecycle.created_at:
            d["lifecycle"]["created_at"] = self.lifecycle.created_at.isoformat()
        d["termination"] = asdict(self.termination)
        d["observability"] = asdict(self.observability)
        if self.provenance and hasattr(self.provenance, "to_dict"):
            d["provenance"] = self.provenance.to_dict()
        if self.projection and hasattr(self.projection, "to_dict"):
            d["projection"] = self.projection.to_dict()
        if self.prompt_ir and hasattr(self.prompt_ir, "to_dict"):
            d["prompt_ir"] = self.prompt_ir.to_dict()
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "RoleLease":
        data = dict(d)
        if "status" in data and isinstance(data["status"], str):
            data["status"] = LeaseStatus(data["status"])
        if "capabilities" in data and isinstance(data["capabilities"], list):
            data["capabilities"] = CapabilitySet.from_dict(
                {"capabilities": data["capabilities"]}
            )
        if "role" in data and isinstance(data["role"], dict):
            data["role"] = RoleDefinition(**data["role"])
        if "execution" in data and isinstance(data["execution"], dict):
            data["execution"] = ExecutionContext(**data["execution"])
        if "lifecycle" in data and isinstance(data["lifecycle"], dict):
            lc = dict(data["lifecycle"])
            if "created_at" in lc and isinstance(lc["created_at"], str):
                lc["created_at"] = datetime.fromisoformat(lc["created_at"])
            data["lifecycle"] = LifecycleModel(**lc)
        if "termination" in data and isinstance(data["termination"], dict):
            data["termination"] = TerminationSpec(**data["termination"])
        if "observability" in data and isinstance(data["observability"], dict):
            data["observability"] = ObservabilitySpec(**data["observability"])
        # projection, prompt_ir, provenance, constraints restored by compiler
        data.pop("projection", None)
        data.pop("prompt_ir", None)
        data.pop("provenance", None)
        data.pop("constraints", None)
        return cls(**data)
