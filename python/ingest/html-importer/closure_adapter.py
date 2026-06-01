"""
Closure Adapter and Influence Gate (Plan 0015 — Phase 2 Scaffolding)

This module provides:
  - ClosureAdapter: test/debug-only wrapper around EnvelopeInterpreter_V1.
    NEVER imported in execution paths.
  - closure_in_execution_path(): CI enforcement check that verifies closure
    code is not reachable from execution-layer functions.
  - ClosureUsageTracer: runtime tracker that records closure creation
    (allowed) vs. closure reads in execution contexts (forbidden).

All three components exist to support the Phase 2 "Influence Drain"
objective: closure still exists in the codebase but is mechanically
proven to have zero effect on runtime outcomes.
"""

from __future__ import annotations

import functools
import inspect
import sys
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, TypeVar

# ═══════════════════════════════════════════════════════════════════
# Known execution-path modules / functions
# ═══════════════════════════════════════════════════════════════════

_EXECUTION_PATH_MODULES: Set[str] = {
    "replay_kernel",
    "semantic_projection",
    "context_assembler",
    "transition_synthesizer",
    "execution_gate",
    "graph_reducer",
    "graph_builder",
}

_EXECUTION_PATH_FUNCTIONS: Set[str] = {
    "ReplayEngine.replay",
    "SemanticProjectionBuilder.from_envelopes",
    "GraphStateReducer.reduce",
    "TransitionSynthesizer.synthesize",
    "ExecutionEligibilityGate.evaluate_transition",
    "context_assembler.assemble",
}


# ═══════════════════════════════════════════════════════════════════
# A. ClosureAdapter — test/debug-only wrapper
# ═══════════════════════════════════════════════════════════════════

class ClosureAdapter:
    """Test/debug-only adapter around legacy EnvelopeInterpreter_V1.

    This adapter wraps the closure interpretation logic but is annotated
    as FORBIDDEN for any execution path.  Import this only from test files
    or comparison harnesses — never from replay_kernel, semantic_projection,
    context_assembler, or any other runtime module.

    Plan 0015 Phase 2: Closure becomes input-only, not referenced.
    Plan 0014 Layer 5: No closure in FSM path.

    Usage (test-only)::

        from closure_adapter import ClosureAdapter
        adapter = ClosureAdapter()
        closures = adapter.interpret(envelopes)
    """

    _USAGE_GUARD_ACTIVE: bool = True

    def __init__(self):
        # Deferred import to avoid creating the interpreter at module level
        from replay_kernel import EnvelopeInterpreter_V1

        self._interpreter = EnvelopeInterpreter_V1()
        self._usage_tracer: Optional[ClosureUsageTracer] = None
        self._guard_check()

    @staticmethod
    def _guard_check():
        """Prevent ClosureAdapter from being instantiated in execution modules."""
        if not ClosureAdapter._USAGE_GUARD_ACTIVE:
            return
        caller_frame = inspect.currentframe()
        if caller_frame is not None and caller_frame.f_back is not None:
            caller_file = caller_frame.f_back.f_code.co_filename
            for exec_mod in _EXECUTION_PATH_MODULES:
                if exec_mod in caller_file and "test_" not in caller_file:
                    raise RuntimeError(
                        f"ClosureAdapter imported from execution-path module "
                        f"({caller_file}). This is forbidden — use only in test/debug code."
                    )

    @classmethod
    def disable_guard(cls):
        """Disable the import guard (useful in test harnesses that verify the adapter itself)."""
        cls._USAGE_GUARD_ACTIVE = False

    def interpret(self, envelopes):
        """Delegates to EnvelopeInterpreter_V1.interpret()."""
        return self._interpreter.interpret(envelopes)

    def attach_tracer(self, tracer: ClosureUsageTracer):
        """Attach a usage tracer for runtime monitoring."""
        self._usage_tracer = tracer


# ═══════════════════════════════════════════════════════════════════
# B. closure_in_execution_path — CI enforcement check
# ═══════════════════════════════════════════════════════════════════

def closure_in_execution_path() -> bool:
    """Check whether any closure-related import or reference exists in
    the current runtime execution graph.

    Returns True if closure code is detectable in the execution path,
    False otherwise.

    This is a CI-hardened assertion that gates Phase 2 → Phase 3
    transition.  The check inspects loaded modules for forbidden imports
    of ReconstructedClosureSet, EnvelopeInterpreter_V1, or SchemaRegistry
    from execution-path modules.
    """

    # Symbols that indicate closure presence in execution modules
    _FORBIDDEN_SYMBOLS: Set[str] = {
        "ReconstructedClosureSet",
        "EnvelopeInterpreter_V1",
        "SchemaRegistry",
    }

    for mod_name, module in sys.modules.items():
        # Only check known execution-path modules
        base = mod_name.split(".")[-1]
        if base not in _EXECUTION_PATH_MODULES:
            continue

        mod_dict = module.__dict__ if hasattr(module, "__dict__") else {}
        for sym in _FORBIDDEN_SYMBOLS:
            if sym in mod_dict:
                return True

    return False


def assert_no_closure_in_execution_path():
    """Hard CI assertion.  Raises AssertionError if closure is detectable."""
    if closure_in_execution_path():
        raise AssertionError(
            "Closure symbols detected in execution path. "
            "Phase 2 influence drain incomplete — cannot proceed to Phase 3 deletion."
        )


# ═══════════════════════════════════════════════════════════════════
# C. ClosureUsageTracer — runtime tracker
# ═══════════════════════════════════════════════════════════════════

@dataclass
class ClosureTraceRecord:
    """A single trace event for closure access."""
    timestamp: float
    action: str          # "created" | "read" | "imported"
    symbol: str          # e.g. "ReconstructedClosureSet"
    module: str          # caller module
    context: str         # "test" | "execution" | "comparison" | "debug"
    allowed: bool        # True if creation/test, False if execution read


class ClosureUsageTracer:
    """Runtime tracer that logs every creation/read of closure symbols.

    Plan 0015 Phase 2.4:  created = allowed, read = forbidden (execution).

    The tracer can be attached to ClosureAdapter or used standalone
    via a context manager.  After a test run the trace log is
    queryable for violations.
    """

    def __init__(self):
        self._log: List[ClosureTraceRecord] = []

    # ── public API ──────────────────────────────────────────────────

    def record_created(self, symbol: str, module: str, context: str = "test"):
        self._log.append(ClosureTraceRecord(
            timestamp=0.0,  # real timestamp set by caller if needed
            action="created",
            symbol=symbol,
            module=module,
            context=context,
            allowed=True,
        ))

    def record_read(self, symbol: str, module: str, context: str = "execution"):
        allowed = context != "execution"
        self._log.append(ClosureTraceRecord(
            timestamp=0.0,
            action="read",
            symbol=symbol,
            module=module,
            context=context,
            allowed=allowed,
        ))

    def record_imported(self, symbol: str, module: str, context: str = "test"):
        self._log.append(ClosureTraceRecord(
            timestamp=0.0,
            action="imported",
            symbol=symbol,
            module=module,
            context=context,
            allowed=(context != "execution"),
        ))

    # ── query API ───────────────────────────────────────────────────

    @property
    def violations(self) -> List[ClosureTraceRecord]:
        """Return all trace records that are NOT allowed."""
        return [r for r in self._log if not r.allowed]

    @property
    def has_violations(self) -> bool:
        return len(self.violations) > 0

    @property
    def total_events(self) -> int:
        return len(self._log)

    def dump(self) -> List[Dict[str, Any]]:
        """Serialize trace log to list-of-dicts for CI artifact output."""
        return [
            {
                "action": r.action,
                "symbol": r.symbol,
                "module": r.module,
                "context": r.context,
                "allowed": r.allowed,
            }
            for r in self._log
        ]

    def reset(self):
        self._log.clear()


# ═══════════════════════════════════════════════════════════════════
# Convenience: global tracer singleton
# ═══════════════════════════════════════════════════════════════════

_global_tracer: Optional[ClosureUsageTracer] = None


def get_global_tracer() -> ClosureUsageTracer:
    global _global_tracer
    if _global_tracer is None:
        _global_tracer = ClosureUsageTracer()
    return _global_tracer


def reset_global_tracer():
    global _global_tracer
    if _global_tracer is not None:
        _global_tracer.reset()
    _global_tracer = ClosureUsageTracer()
