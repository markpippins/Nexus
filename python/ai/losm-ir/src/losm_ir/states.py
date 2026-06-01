from enum import Enum


class WorkflowState(str, Enum):
    NEW = "NEW"
    PLAN_DONE = "PLAN_DONE"
    CRITIQUED = "CRITIQUED"
    SPEC_READY = "SPEC_READY"
    EXECUTED = "EXECUTED"
    VALIDATED = "VALIDATED"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"
    BLOCKED = "BLOCKED"


__all__ = ["WorkflowState"]
