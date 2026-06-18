from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ── Module-level logger ─────────────────────────────────────────────
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
    harness: Literal["opencode", "ollama", "codex"]
    model: str


class RegistryConfig(BaseModel):
    """Top-level registry: default/fallback models + executor catalogue."""
    default_model: ModelConfig
    fallback_model: ModelConfig
    executors: List[ExecutorRegistration] = Field(default_factory=list)
    model_config = {"extra": "allow"}


def load_registry(path: str | Path | None = None) -> RegistryConfig:
    """Load the registry from a JSON file.

    If *path* is omitted the file ``registry.json`` in the directory
    that contains this module is used.

    Relative executor ``command`` values are resolved against the
    directory that contains the registry file.
    """
    if path is None:
        path = Path(__file__).with_name("registry.json")
    _log.info("load_registry: entry path=%s", path)
    registry_dir = Path(path).resolve().parent
    with open(path) as fh:
        config = RegistryConfig.model_validate(json.load(fh))
    # Resolve relative commands against the registry file's directory
    resolved_count = 0
    for executor in config.executors:
        cmd = executor.invocation_contract.command
        if cmd and not os.path.isabs(cmd):
            resolved = str(Path(registry_dir, cmd).resolve())
            executor.invocation_contract.command = resolved
            resolved_count += 1
    _log.info("load_registry: loaded executor=%s resolved_paths=%d",
              len(config.executors), resolved_count)
    return config


def resolve_executor(
    registry: RegistryConfig, harness: str
) -> ExecutorRegistration:
    """Return the first registered executor that supports *harness*.

    Raises :exc:`ValueError` when no executor matches.
    """
    _log.debug("resolve_executor: entry harness=%s", harness)
    for executor in registry.executors:
        if harness in executor.supports:
            _log.debug("resolve_executor: matched executor=%s harness=%s",
                       executor.executor_id, harness)
            return executor
    _log.warning("resolve_executor: no executor for harness=%s", harness)
    raise ValueError(
        f"No executor registered for harness '{harness}'. "
        f"Available harnesses: {available_harnesses(registry)}"
    )


def available_harnesses(registry: RegistryConfig) -> list[str]:
    """Return every harness covered by the registry's executors."""
    seen: set[str] = set()
    for executor in registry.executors:
        seen.update(executor.supports)
    harnesses = sorted(seen)
    _log.debug("available_harnesses: count=%d harnesses=%s", len(harnesses), harnesses)
    return harnesses


__all__ = [
    "ExecutorRegistration",
    "InvocationContract",
    "ModelConfig",
    "RegistryConfig",
    "available_harnesses",
    "load_registry",
    "resolve_executor",
]
