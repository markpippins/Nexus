from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


_log = logging.getLogger("conduit.executor_registry")


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


class ModelConfig(BaseModel):
    """A harness + model pair used to resolve which AI to invoke."""
    harness: str
    model: str


class RegistryConfig(BaseModel):
    """Minimal registry config — AI config is owned by tackle-mcp."""
    default_model: ModelConfig
    fallback_model: ModelConfig
    executors: List[ExecutorRegistration] = Field(default_factory=list)
    model_config = {"extra": "allow"}


# ── Defaults (no registry.json — tackle owns AI config) ─────────────

_DEFAULT_EXECUTOR_CMD = str(Path(__file__).with_name("executor_cloud.py"))

_DEFAULT_EXECUTORS = [
    ExecutorRegistration(
        executor_id="executor-cloud",
        supports=["opencode", "ollama", "codex"],
        invocation_contract=InvocationContract(type="cli", command=_DEFAULT_EXECUTOR_CMD),
    )
]


def load_registry(path: str | Path | None = None) -> RegistryConfig:
    """Return a minimal registry with hardcoded executor_cloud.py.

    The old registry.json file has been removed — AI config (providers,
    harnesses, models, role configs) is now owned by tackle-mcp on :3400.
    Conduit only needs to know that executor_cloud.py is the subprocess
    that runs WorkRequest DCOs.
    """
    _log.info("load_registry: using hardcoded executor (executor_cloud.py)")
    return RegistryConfig(
        default_model=ModelConfig(harness="opencode", model="opencode/big-pickle"),
        fallback_model=ModelConfig(harness="ollama", model="ollama/qwen2.5-coder"),
        executors=list(_DEFAULT_EXECUTORS),
    )


def resolve_executor(
    registry: RegistryConfig, harness: str
) -> ExecutorRegistration:
    """Return the executor that supports *harness*.

    executor_cloud.py handles all harnesses — this always succeeds.
    """
    _log.debug("resolve_executor: harness=%s", harness)
    for executor in registry.executors:
        if harness in executor.supports:
            return executor
    _log.warning("resolve_executor: harness=%s not in supports list, using default", harness)
    return _DEFAULT_EXECUTORS[0]


def available_harnesses(registry: RegistryConfig) -> list[str]:
    """Return every harness covered by the registry's executors."""
    seen: set[str] = set()
    for executor in registry.executors:
        seen.update(executor.supports)
    return sorted(seen)


__all__ = [
    "ExecutorRegistration",
    "InvocationContract",
    "ModelConfig",
    "RegistryConfig",
    "available_harnesses",
    "load_registry",
    "resolve_executor",
]