import uuid
from typing import List

from losm_ir.plan import PlanIR, ExecutionStep as PlanStep
from losm_ir.spec import SpecIR, SpecStep


class PlanCompiler:
    @staticmethod
    def compile(plan: PlanIR, plan_id: str = "unknown_plan_id") -> SpecIR:
        spec_steps: List[SpecStep] = []
        for step in plan.execution_steps:
            spec_steps.append(
                SpecStep(
                    step_id=f"step_{step.order}",
                    command=step.action,
                    description=step.description,
                    input_contracts=[],
                    output_contracts=[],
                    execution_policy="default",
                    dependencies=[],
                )
            )

        return SpecIR(
            spec_id=str(uuid.uuid4()),
            plan_id=plan_id,
            intent=plan.goal_interpretation,
            steps=spec_steps,
            failure_policy="fail_fast",
        )
