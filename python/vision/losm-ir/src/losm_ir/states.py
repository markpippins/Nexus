from enum import Enum
from typing import Optional


class WorkflowState(str, Enum):
    """IR-level / simplified lifecycle phase.

    Designed for protocol contracts and high-level status reporting.
    This is a *projection* of the operational WorkStatus — see
    work_status_to_phase() for the mapping.
    """
    NEW = "NEW"
    PLAN_DONE = "PLAN_DONE"
    CRITIQUED = "CRITIQUED"
    SPEC_READY = "SPEC_READY"
    EXECUTED = "EXECUTED"
    VALIDATED = "VALIDATED"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"


class WorkStatus(str, Enum):
    """Canonical operational pipeline state.

    This is the authoritative lifecycle enum — the DB column
    (PlanningTask.status) uses it, and the transition validation table
    is keyed on these values.
    """
    NEW = "NEW"
    INTAKE = "INTAKE"
    PLAN_GENERATION = "PLAN_GENERATION"
    PLAN_REVIEW = "PLAN_REVIEW"
    PLAN_APPROVAL_GATE = "PLAN_APPROVAL_GATE"
    SPEC_GENERATION = "SPEC_GENERATION"
    EXECUTION = "EXECUTION"
    VALIDATION = "VALIDATION"
    COMPLETION = "COMPLETION"
    BLOCKED = "BLOCKED"
    FAILED = "FAILED"


def work_status_to_phase(s: WorkStatus) -> WorkflowState:
    """Project an operational WorkStatus onto its lifecycle phase.

    This is a many-to-one compression — multiple operational states
    map to the same IR-level phase.
    """
    mapping: dict[WorkStatus, WorkflowState] = {
        WorkStatus.NEW: WorkflowState.NEW,
        WorkStatus.INTAKE: WorkflowState.NEW,
        WorkStatus.PLAN_GENERATION: WorkflowState.PLAN_DONE,
        WorkStatus.PLAN_REVIEW: WorkflowState.PLAN_DONE,
        WorkStatus.PLAN_APPROVAL_GATE: WorkflowState.PLAN_DONE,
        WorkStatus.SPEC_GENERATION: WorkflowState.SPEC_READY,
        WorkStatus.EXECUTION: WorkflowState.EXECUTED,
        WorkStatus.VALIDATION: WorkflowState.VALIDATED,
        WorkStatus.COMPLETION: WorkflowState.COMPLETE,
        WorkStatus.BLOCKED: WorkflowState.BLOCKED,
        WorkStatus.FAILED: WorkflowState.FAILED,
    }
    return mapping.get(s, WorkflowState.NEW)


__all__ = ["WorkflowState", "WorkStatus", "work_status_to_phase"]
