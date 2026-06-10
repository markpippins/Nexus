import json
from typing import Any, Dict, List, Optional
from datetime import datetime
from executor_registry import ModelConfig
from work_request import (
    CompletionCondition,
    ProducedFile,
    WorkRequestArtifacts,
    WorkRequestConstraints,
    WorkRequestDCO,
    WorkRequestDecomposition,
    WorkRequestExecutionState,
    WorkRequestIntent,
    WorkRequestLineage,
    WorkRequestMetadata,
    WorkRequestRequirements,
    WorkRequestStep,
    WorkRequestSuccessCriteria,
)


# ── helpers ────────────────────────────────────────────────────────────────

def _parse_json(val):
    """Parse a JSON string or list into a Python list, never raising."""
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, list) else [parsed]
        except (json.JSONDecodeError, TypeError):
            return [val] if val.strip() else []
    if isinstance(val, list):
        return val
    return [] if val is None else [val]


def _infer_priority(plan: Dict[str, Any]) -> str:
    """Heuristic priority from plan metadata."""
    title = (plan.get("title") or "").lower()
    if any(kw in title for kw in ("critical", "urgent", "fix", "blocker")):
        return "high"
    if any(kw in title for kw in ("clean", "refactor", "polish")):
        return "low"
    return "medium"


def _infer_abstraction(plan: Dict[str, Any]) -> str:
    """Infer abstraction level from plan size / acceptance criteria count."""
    n_criteria = len(_parse_json(plan.get("acceptance_criteria")))
    n_files = len(_parse_json(plan.get("files_affected")))
    if n_criteria >= 4 or n_files >= 4:
        return "system"
    return "task"


def _build_completion_conditions(
    acceptance_criteria: List[str],
) -> List[CompletionCondition]:
    return [
        CompletionCondition(
            condition=ac,
            evaluator="code-reviewer",
        )
        for ac in acceptance_criteria
    ]


def _build_files_affected(plan: Dict[str, Any]) -> List[ProducedFile]:
    files = _parse_json(plan.get("files_affected"))
    if not files:
        return []
    return [
        ProducedFile(
            path=str(f),
            type="code",
            origin_step="step_1",
        )
        for f in files
    ]


def _build_safety_constraints() -> List[str]:
    return [
        "Do not delete or overwrite historical plan artifacts",
        "Do not modify .conduit-data/ directory structure",
        "Preserve existing receipt and audit records",
        "Follow existing project conventions when editing code",
    ]


class WorkRequestFactory:
    @staticmethod
    def create_from_plan(
        plan: Dict[str, Any],
        role: str = "builder",
        model_cfg: Optional[ModelConfig] = None,
        working_path: str = ".",
        session_id: str = "",
    ) -> WorkRequestDCO:
        wr_id = f"wr-{plan['id']}-{int(datetime.utcnow().timestamp())}"
        now = datetime.utcnow().isoformat() + "Z"

        acceptance_criteria = _parse_json(plan.get("acceptance_criteria"))
        files_affected = _build_files_affected(plan)

        # ── intent ────────────────────────────────────────────────────
        intent = WorkRequestIntent(
            problem_statement=plan.get("goal", ""),
            desired_outcome=plan.get("title", ""),
            domain="nexus",
            priority=_infer_priority(plan),
            user_intent_trace=plan.get("prompt_ref", ""),
            abstraction_level=_infer_abstraction(plan),
        )

        # ── decomposition ─────────────────────────────────────────────
        step = WorkRequestStep(
            step_id="step_1",
            description=(
                f"Plan {plan['id']}: {plan.get('title', '')}\n\n"
                f"Goal: {plan.get('goal', '')}\n\n"
                f"Content: {plan.get('content', '')}\n\n"
                f"Acceptance criteria:\n"
                + "\n".join(f"  - {ac}" for ac in acceptance_criteria)
            ),
            dependencies=[],
            outputs=["changes_committed"],
            type="execution",
        )

        decomposition = WorkRequestDecomposition(
            strategy="Direct implementation of plan steps",
            steps=[step],
            parallelism_model="sequential",
            recursion_allowed=False,
        )

        # ── requirements ──────────────────────────────────────────────
        requirements = WorkRequestRequirements(
            functional=acceptance_criteria,
            non_functional=[],
            system_requirements=[],
            tool_requirements=[],
        )

        # ── constraints ───────────────────────────────────────────────
        constraints = WorkRequestConstraints(
            forbidden_actions=[],
            safety_constraints=_build_safety_constraints(),
            resource_limits=None,
            architectural_constraints=[],
        )

        # ── success criteria ──────────────────────────────────────────
        success_criteria = WorkRequestSuccessCriteria(
            validation_rules=acceptance_criteria,
            acceptance_tests=acceptance_criteria,
            completion_conditions=_build_completion_conditions(
                acceptance_criteria
            ),
            failure_modes=[
                "Files affected list does not match actual changes",
                "Acceptance criteria not satisfied",
                "Typecheck or tests fail",
            ],
        )

        # ── execution state ───────────────────────────────────────────
        execution_state = WorkRequestExecutionState(
            status="pending",
            current_step="step_1",
            progress=0.0,
            retries=0,
            last_updated=now,
        )

        # ── lineage ───────────────────────────────────────────────────
        lineage = WorkRequestLineage(
            derived_from=[plan["id"]],
            supersedes=None,
            branches=[],
            merge_history=[],
        )

        # ── artifacts ─────────────────────────────────────────────────
        artifacts = WorkRequestArtifacts(
            produced_files=files_affected,
            intermediate_outputs=[],
        )

        # ── metadata ──────────────────────────────────────────────────
        metadata = WorkRequestMetadata(
            created_at=now,
            updated_at=now,
            agent_id="conduit",
            mode="default",
            tags=["plan-migration", role],
            role=role,
            harness=model_cfg.harness if model_cfg else "opencode",
            model=model_cfg.model if model_cfg else "",
            session_id=session_id,
        )

        return WorkRequestDCO(
            id=wr_id,
            version=1,
            path=working_path,  # executor_cloud.py uses this for artifact placement
            intent=intent,
            decomposition=decomposition,
            requirements=requirements,
            constraints=constraints,
            success_criteria=success_criteria,
            execution_state=execution_state,
            lineage=lineage,
            artifacts=artifacts,
            metadata=metadata,
        )
