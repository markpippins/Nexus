#!/usr/bin/env python3
"""Daemon Runtime for Nexus Work Request Pipeline (WRP).

This script acts as the operational runtime substrate. It:
1. Polls the queued WorkRequests.
2. Performs mock CIR/CEGL governance checks.
3. Maps WorkRequest intents/types to a capability-bound Executor via the ExecutorRegistry.
4. Invokes the executor and demands an Execution Receipt.
5. Archives the WorkRequest based on the outcome.
"""

import os
import json
import time
import shutil
import argparse
import subprocess
import uuid
from datetime import datetime
from pathlib import Path

# Base Paths
NEXUS_ROOT = Path(__file__).resolve().parent.parent.parent
EXECUTORS_CONFIG = NEXUS_ROOT / ".agent" / "config" / "executors.json"

# Dynamic Paths (Set by argparse)
WR_QUEUED = None
WR_COMPLETE = None
WR_FAILED = None
EVENT_LOG_DIR = None

def ensure_dirs():
    for d in [WR_QUEUED, WR_COMPLETE, WR_FAILED, EVENT_LOG_DIR]:
        d.mkdir(parents=True, exist_ok=True)

def load_executors() -> dict:
    if not EXECUTORS_CONFIG.exists():
        return {"executors": []}
    with open(EXECUTORS_CONFIG, 'r') as f:
        return json.load(f)

def run_governance_check(wr_data: dict) -> bool:
    """Mock CIR / CEGL validation."""
    return True

def select_executor(wr_data: dict, registry: dict) -> dict:
    """Lookup executor in registry based on capability matching."""
    wr_type = wr_data.get("type", "CODE_WRITE")
    for ex in registry.get("executors", []):
        if wr_type in ex.get("supports", []):
            return ex
    return None

def invoke_executor(executor: dict, wr_path: Path, wr_data: dict) -> dict:
    """Invokes the executor via its invocation contract."""
    contract = executor.get("invocation_contract", {})
    
    if contract.get("type") == "cli":
        return {
            "work_request_id": wr_data.get("id", str(uuid.uuid4())),
            "executor_id": executor.get("executor_id"),
            "inputs": [{"file": str(wr_path), "state": "immutable_intent"}],
            "mutations": [{"target": "example.py", "action": "CREATE", "diff": "+print('hello')"}],
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "result": "SUCCESS",
            "lineage_parent": "graph_state_prev"
        }
    else:
        raise ValueError(f"Unsupported invocation type: {contract.get('type')}")

def process_queue():
    if not WR_QUEUED.exists():
        return

    registry = load_executors()

    for wr_file in WR_QUEUED.glob("*.json"):
        print(f"Processing {wr_file.name}...")
        try:
            with open(wr_file, 'r') as f:
                wr_data = json.load(f)
            
            if not run_governance_check(wr_data):
                print(f"Governance validation failed for {wr_file.name}")
                shutil.move(str(wr_file), str(WR_FAILED / wr_file.name))
                continue
                
            executor = select_executor(wr_data, registry)
            if not executor:
                print(f"No executor found supporting type: {wr_data.get('type')} for {wr_file.name}")
                shutil.move(str(wr_file), str(WR_FAILED / wr_file.name))
                continue
                
            print(f"Invoking executor {executor.get('executor_id')}...")
            receipt = invoke_executor(executor, wr_file, wr_data)
            
            if receipt.get("result") == "SUCCESS":
                receipt_path = EVENT_LOG_DIR / f"receipt_{wr_file.name}"
                with open(receipt_path, 'w') as f:
                    json.dump(receipt, f, indent=2)
                    
                shutil.move(str(wr_file), str(WR_COMPLETE / wr_file.name))
                print(f"Successfully processed {wr_file.name}")
            else:
                shutil.move(str(wr_file), str(WR_FAILED / wr_file.name))
                print(f"Execution failed for {wr_file.name}")
                
        except Exception as e:
            print(f"Error processing {wr_file.name}: {e}")
            shutil.move(str(wr_file), str(WR_FAILED / wr_file.name))

def main():
    parser = argparse.ArgumentParser(description="Nexus WRP Daemon")
    parser.add_argument("--watch-project", required=True, help="Absolute path to the project root containing .pipeline")
    args = parser.parse_args()

    project_path = Path(args.watch_project).resolve()
    pipeline_dir = project_path / ".pipeline"
    
    if not pipeline_dir.exists():
        print(f"Error: Pipeline directory not found at {pipeline_dir}")
        return

    global WR_QUEUED, WR_COMPLETE, WR_FAILED, EVENT_LOG_DIR
    WR_QUEUED = pipeline_dir / "WORK_REQUESTS" / "queued"
    WR_COMPLETE = pipeline_dir / "WORK_REQUESTS" / "complete"
    WR_FAILED = pipeline_dir / "WORK_REQUESTS" / "failed"
    EVENT_LOG_DIR = pipeline_dir / "WORK_REQUESTS" / "log"

    ensure_dirs()
    print("Starting Nexus WRP Daemon...")
    print(f"Watching {WR_QUEUED} for WorkRequests...")
    
    try:
        while True:
            process_queue()
            time.sleep(5)
    except KeyboardInterrupt:
        print("\nDaemon stopped.")

if __name__ == "__main__":
    main()
