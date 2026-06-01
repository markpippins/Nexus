"""Deterministic execution state transition service.

Provides pure, in-memory Finite State Machine enforcement for execution lifecycles.
Decoupled from persistence. Layer 2 Host execution coordination only.
"""

from typing import List, Dict, Any
from datetime import datetime

class TransitionError(Exception):
    """Raised when an invalid state transition is attempted."""
    pass

class LifecycleEvent:
    def __init__(self, execution_id: str, from_state: str, to_state: str, actor: str = "system", reason: str = None, metadata: dict = None):
        self.execution_id = execution_id
        self.from_state = from_state
        self.to_state = to_state
        self.actor = actor
        self.reason = reason
        self.metadata = metadata or {}
        self.timestamp = datetime.utcnow().isoformat()

class TransitionService:
    """Enforces deterministic lifecycle transitions for Executions."""

    # Define the valid state transition matrix
    VALID_TRANSITIONS = {
        "NEW": {"INTAKE", "FAILED", "BLOCKED"},
        "INTAKE": {"PLAN_GENERATION", "FAILED", "BLOCKED"},
        "PLAN_GENERATION": {"PLAN_REVIEW", "FAILED", "BLOCKED"},
        "PLAN_REVIEW": {"PLAN_APPROVAL_GATE", "PLAN_GENERATION", "FAILED", "BLOCKED"},
        "PLAN_APPROVAL_GATE": {"SPEC_GENERATION", "PLAN_GENERATION", "FAILED", "BLOCKED"},
        "SPEC_GENERATION": {"EXECUTION", "FAILED", "BLOCKED"},
        "EXECUTION": {"VALIDATION", "FAILED", "BLOCKED"},
        "VALIDATION": {"COMPLETION", "EXECUTION", "PLAN_GENERATION", "FAILED", "BLOCKED"},
        "BLOCKED": {"NEW", "INTAKE", "PLAN_GENERATION", "PLAN_REVIEW", "PLAN_APPROVAL_GATE", "SPEC_GENERATION", "EXECUTION", "VALIDATION", "FAILED", "COMPLETION"},
        "COMPLETION": set(), # Terminal
        "FAILED": set(), # Terminal
    }

    def __init__(self):
        # In-memory execution state map: execution_id -> current_state
        self._execution_states: Dict[str, str] = {}
        # Ephemeral lifecycle event log
        self._event_log: List[LifecycleEvent] = []

    def register_execution(self, execution_id: str):
        if execution_id not in self._execution_states:
            self._execution_states[execution_id] = "NEW"

    def transition(
        self,
        execution_id: str,
        to_state: str,
        actor: str = "system",
        reason: str = None,
        metadata: dict = None
    ) -> str:
        """
        Transition an execution to a new state deterministically.
        Records an append-only LifecycleEvent in memory.
        """
        if execution_id not in self._execution_states:
             raise ValueError(f"Execution not found: {execution_id}")

        from_state = self._execution_states[execution_id]

        # Enforce transition matrix
        if to_state not in self.VALID_TRANSITIONS.get(from_state, set()):
            raise TransitionError(f"Invalid transition from {from_state} to {to_state}")

        # Mutate current state
        self._execution_states[execution_id] = to_state

        # Append to ephemeral lifecycle log
        event = LifecycleEvent(
            execution_id=execution_id,
            from_state=from_state,
            to_state=to_state,
            actor=actor,
            reason=reason,
            metadata=metadata
        )
        self._event_log.append(event)
        
        return to_state

    def get_history(self, execution_id: str) -> List[LifecycleEvent]:
        return [e for e in self._event_log if e.execution_id == execution_id]
