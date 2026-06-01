import logging
from typing import Any

from losm_shell.lifecycle.transition import TransitionService
from losm_shell.runtime.executor import DAGExecutor, ExecutionStep

logger = logging.getLogger(__name__)


class PipelineCoordinator:
    def __init__(self):
        self.transition_service = TransitionService()
        self.executor = DAGExecutor()

    def coordinate(self, execution_id: str, payload: Any) -> dict:
        self.transition_service.register_execution(execution_id)

        try:
            state = self.transition_service.transition(execution_id, "INTAKE", actor="coordinator")
            state = self.transition_service.transition(execution_id, "PLAN_GENERATION", actor="coordinator")
            state = self.transition_service.transition(execution_id, "PLAN_REVIEW", actor="coordinator")
            state = self.transition_service.transition(execution_id, "PLAN_APPROVAL_GATE", actor="coordinator")
            state = self.transition_service.transition(execution_id, "SPEC_GENERATION", actor="coordinator")
            state = self.transition_service.transition(execution_id, "EXECUTION", actor="coordinator")

            steps = [
                ExecutionStep(step_id="step_1", dependencies=[], payload=payload)
            ]
            execution_result = self.executor.execute(steps)

            if execution_result.status == "FAILED":
                state = self.transition_service.transition(execution_id, "FAILED", actor="coordinator", reason=execution_result.failure_summary)
                return {"execution_id": execution_id, "status": state, "result": execution_result}

            state = self.transition_service.transition(execution_id, "VALIDATION", actor="coordinator")
            state = self.transition_service.transition(execution_id, "COMPLETION", actor="coordinator")

            return {"execution_id": execution_id, "status": state, "result": execution_result}

        except Exception as e:
            logger.exception("Pipeline coordination failed")
            state = self.transition_service.transition(execution_id, "FAILED", actor="coordinator", reason=str(e))
            return {"execution_id": execution_id, "status": state, "error": str(e)}
