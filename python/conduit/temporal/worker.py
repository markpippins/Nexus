"""Temporal Worker for Conduit agent orchestration.

Replaces the cron-driven main.py --all loop.  The Worker polls Temporal
task queues and executes Activities/Workflows.

Usage:
    python -m conduit.temporal.worker          # All roles
    python -m conduit.temporal.worker --role builder   # Single role

Requires a running Temporal server (localhost:7233 by default) and
the Conduit schema in PostgreSQL (configured via CONDUIT_PG_SCHEMA, defaults to 'conduit').
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

from temporalio.client import Client
from temporalio.worker import Worker

# Ensure conduit is on the path for shared module imports
_PARENT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PARENT))

# Load .env from conduit/
from env_config import load_env  # noqa: F401 — fires at import time

TEMPORAL_ADDRESS = os.environ.get("TEMPORAL_ADDRESS", "localhost:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "conduit")

# Import all Activity functions
from temporal.activities.db_operations import (
    claim_ticket_activity,
    insert_receipt_activity,
    advance_cursor_activity,
    create_next_tickets_activity,
    create_session_activity,
    close_session_activity,
    close_ticket_activity,
    update_work_request_status_activity,
    add_work_request_activity,
    get_eligible_plans_activity,
    get_plan_by_id_activity,
    get_role_model_config_activity,
    get_fallback_models_activity,
    get_failure_recovery_config_activity,
    is_circuit_breaker_tripped_activity,
    is_conduit_paused_activity,
    trip_and_requeue_activity,
    detect_stale_tickets_activity,
    detect_expired_tickets_activity,
    increment_ticket_tokens_activity,
    release_ticket_activity,
)
from temporal.activities.execute_model import execute_with_model
from temporal.activities.work_request import (
    build_work_request_dco_activity,
    resolve_model_chain_activity,
)

# Import Workflows
from temporal.workflows.plan_execution import PlanExecutionWorkflow
from temporal.workflows.test_invoke import TestInvokeWorkflow
from temporal.activities.test_invoke import (
    resolve_test_model_activity,
    execute_test_invoke_activity,
)

# Activity lists for the Worker
ALL_ACTIVITIES = [
    claim_ticket_activity,
    insert_receipt_activity,
    advance_cursor_activity,
    create_next_tickets_activity,
    create_session_activity,
    close_session_activity,
    close_ticket_activity,
    update_work_request_status_activity,
    add_work_request_activity,
    get_eligible_plans_activity,
    get_plan_by_id_activity,
    get_role_model_config_activity,
    get_fallback_models_activity,
    get_failure_recovery_config_activity,
    is_circuit_breaker_tripped_activity,
    is_conduit_paused_activity,
    trip_and_requeue_activity,
    detect_stale_tickets_activity,
    detect_expired_tickets_activity,
    increment_ticket_tokens_activity,
    release_ticket_activity,
    execute_with_model,
    build_work_request_dco_activity,
    resolve_model_chain_activity,
    resolve_test_model_activity,
    execute_test_invoke_activity,
]

ALL_WORKFLOWS = [
    PlanExecutionWorkflow,
    TestInvokeWorkflow,
]

ROLE_TASK_QUEUES = ["builder", "reviewer", "planner", "critic", "default", "test"]


async def main(role: str = "default"):
    """Start the Temporal Worker."""

    client = await Client.connect(
        TEMPORAL_ADDRESS,
        namespace=TEMPORAL_NAMESPACE,
    )

    task_queues = [role] if role != "all" else ROLE_TASK_QUEUES

    workers = []
    for queue in task_queues:
        worker = Worker(
            client,
            task_queue=queue,
            workflows=ALL_WORKFLOWS,
            activities=ALL_ACTIVITIES,
            max_concurrent_activities=int(
                os.environ.get("TEMPORAL_MAX_CONCURRENT", "4")
            ),
        )
        workers.append(worker)
        print(f"Worker started on task queue: {queue}")

    print(f"Temporal namespace: {TEMPORAL_NAMESPACE}")
    print(f"Activities registered: {len(ALL_ACTIVITIES)}")
    print(f"Workflows registered: {len(ALL_WORKFLOWS)}")
    print("Waiting for tasks...")

    try:
        await asyncio.gather(*[w.run() for w in workers])
    except KeyboardInterrupt:
        print("\nShutting down worker...")
        for w in workers:
            await w.shutdown()
        print("Worker stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Temporal Worker for Conduit agent orchestration"
    )
    parser.add_argument(
        "--role",
        default="all",
        choices=["builder", "reviewer", "planner", "critic", "default", "all"],
        help="Task queue to poll (default: all)",
    )
    args = parser.parse_args()
    asyncio.run(main(args.role))
