"""Temporal Activity for building WorkRequest DCOs from plans."""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from temporalio import activity

_PARENT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_PARENT))

from work_request_factory import WorkRequestFactory
from executor_registry import ModelConfig, RegistryConfig, load_registry, resolve_executor

DCO_DIR = os.environ.get(
    "PIPELINE_DCO_DIR",
    "/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS",
)


@activity.defn
async def build_work_request_dco_activity(
    plan: Dict[str, Any],
    role: str = "builder",
    model_cfg: Optional[Dict[str, Any]] = None,
    working_path: str = "",
    session_id: str = "",
) -> Dict[str, Any]:
    """Build a WorkRequest DCO from a plan and write it to disk.

    Returns a dict with 'dco' (the WorkRequestDCO as dict), 'dco_path' (file path),
    and 'executor_cmd' (the executor invocation command).
    """
    if not working_path:
        working_path = os.environ.get(
            "PIPELINE_ROOT",
            "/home/codex/dev",
        )

    mcfg = None
    if model_cfg:
        mcfg = ModelConfig(harness=model_cfg["harness"], model=model_cfg["model"])

    dco_obj = WorkRequestFactory.create_from_plan(
        plan,
        role=role,
        model_cfg=mcfg,
        working_path=working_path,
        session_id=session_id,
    )

    # Write DCO to disk
    os.makedirs(DCO_DIR, exist_ok=True)
    dco_path = os.path.join(DCO_DIR, f"{dco_obj.id}.json")
    with open(dco_path, "w") as f:
        json.dump(dco_obj.model_dump(by_alias=True), f, indent=2)

    # Resolve executor
    registry = load_registry()
    executor = resolve_executor(registry, model_cfg["harness"] if model_cfg else "opencode")

    dco_dict = dco_obj.model_dump(by_alias=True)

    return {
        "dco": dco_dict,
        "dco_path": dco_path,
        "wr_id": dco_obj.id,
        "executor_cmd": executor.invocation_contract.command,
        "executor_id": executor.executor_id,
    }


@activity.defn
async def resolve_model_chain_activity(role: str) -> list:
    """Resolve the model chain (primary + fallbacks) for a role.

    Returns a list of dicts with keys: harness, model, retry_delay, max_retries.
    The first entry is the primary model, followed by fallback models.
    """
    from db_adapter import DBAdapter

    db = DBAdapter()

    # Get primary model
    cfg = db.get_role_model_config(role)
    chain = []
    seen_models: set = set()

    if cfg:
        chain.append({
            "harness": cfg["harness"],
            "model": cfg["model"],
            "provider_type": cfg.get("provider_type", ""),
            "retry_delay": 120,
            "max_retries": 3,
        })
        seen_models.add(cfg["model"])

    # Get fallback models — skip any whose model_identifier was already added
    # (role_models includes priority 0 which duplicates the primary from role_config).
    fallbacks = db.get_fallback_models(role)
    for fb in fallbacks:
        model_id = fb["model_identifier"]
        if model_id in seen_models:
            continue
        sem = fb.get("invocation_semantics", {})
        harness_binary = sem.get("binary", "") if isinstance(sem, dict) else ""
        if not harness_binary:
            activity.logger.warning(
                f"resolve_model_chain: skipping fallback for role={role} "
                f"model={model_id} — harness '{fb.get('harness_name', '?')}' "
                f"(id={fb.get('harness_id', '?')}) has no 'binary' in invocation_semantics"
            )
            continue
        if model_id:
            chain.append({
                "harness": harness_binary,
                "model": model_id,
                "provider_type": fb.get("provider_type", ""),
                "retry_delay": 120,
                "max_retries": 3,
            })
            seen_models.add(model_id)

    activity.logger.info(f"resolve_model_chain: role={role} chain_length={len(chain)}")
    return chain
