import logging
from typing import Any, Optional

from losm_shell.lifecycle.transition import validate_transition, TransitionError
from losm_shell.runtime.executor import DAGExecutor, ExecutionStep
from losm_shell.runtime.handler import ExecutionContext, NullStepHandler, StepHandler

logger = logging.getLogger(__name__)


class PipelineCoordinator:
    def __init__(self, step_handler: Optional[StepHandler] = None):
        self.executor = DAGExecutor()
        self.step_handler = step_handler or NullStepHandler()

    async def coordinate(self, execution_id: str, current_state: str, payload: Any) -> dict:
        try:
            self._transition_or_fail(current_state, "INTAKE")
            self._transition_or_fail(current_state, "PLAN_GENERATION")
            self._transition_or_fail(current_state, "PLAN_REVIEW")
            self._transition_or_fail(current_state, "PLAN_APPROVAL_GATE")
            self._transition_or_fail(current_state, "SPEC_GENERATION")
            self._transition_or_fail(current_state, "EXECUTION")

            steps = [
                ExecutionStep(step_id="step_1", dependencies=[], payload=payload)
            ]
            context = ExecutionContext(
                work_request_id=execution_id,
                execution_id=execution_id,
                payload=payload,
            )
            execution_result = await self.executor.execute(steps, self.step_handler, context)

            if execution_result.status == "FAILED":
                self._transition_or_fail(current_state, "FAILED")
                return {"execution_id": execution_id, "status": "FAILED", "result": execution_result}

            self._transition_or_fail(current_state, "VALIDATION")
            self._transition_or_fail(current_state, "COMPLETION")

            return {"execution_id": execution_id, "status": "COMPLETION", "result": execution_result}

        except Exception as e:
            logger.exception("Pipeline coordination failed")
            return {"execution_id": execution_id, "status": "FAILED", "error": str(e)}

    def _transition_or_fail(self, current_state: str, target: str) -> None:
        """Validate a transition. Raises TransitionError if not allowed."""
        result = validate_transition(current_state, target)
        if not result.allowed:
            raise TransitionError(result.reason)
