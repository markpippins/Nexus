"""Dispatcher: routes StepRequested events to step handlers, manages auto-advance."""

import json, os, sys, uuid, datetime, concurrent.futures

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
sys.path.insert(0, PROJECT_ROOT)

EVENT_DIR = os.path.join(PROJECT_ROOT, "events")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "events")
ARTIFACT_DIR = os.path.join(PROJECT_ROOT, "artifacts")
OFFSET_DIR = os.path.join(PROJECT_ROOT, "offsets", "dispatcher")

from validators.loader import load_events
from handlers.base import StepHandler
from handlers.steps import (
    VocabularyHandler,
    RequirementsHandler,
    TypeSpecHandler,
    CompileHandler,
    RefactorHandler,
    IntegrateHandler,
)
from agents.llm import warmup_all

HANDLERS = {
    "vocabulary": VocabularyHandler,
    "requirements": RequirementsHandler,
    "typespec": TypeSpecHandler,
    "compile": CompileHandler,
    "refactor": RefactorHandler,
    "integrate": IntegrateHandler,
}

STEP_ORDER = ["vocabulary", "requirements", "typespec", "compile", "refactor", "integrate"]

COMPLETION_TYPES = {
    "vocabulary": "VocabularyDrafted",
    "requirements": "RequirementsFormalized",
    "typespec": "TypeSpecDrafted",
    "compile": "SpecCompiled",
    "refactor": "RefactorDrafted",
    "integrate": "Integrated",
}

# Steps that require human review (never auto-advance through these)
REVIEW_REQUIRED = {"typespec", "refactor"}


def _log(msg):
    ts = datetime.datetime.now(datetime.UTC).isoformat()
    print(f"[{ts}] [dispatcher] {msg}")


def read_offset():
    if os.path.exists(OFFSET_DIR):
        try:
            with open(OFFSET_DIR, "r") as f:
                data = json.load(f)
                return data.get("last_timestamp", ""), set(data.get("processed_ids", []))
        except (json.JSONDecodeError, KeyError):
            pass
    return "", set()


def write_offset(timestamp, processed_ids):
    os.makedirs(os.path.dirname(OFFSET_DIR), exist_ok=True)
    with open(OFFSET_DIR, "w") as f:
        json.dump({
            "last_timestamp": timestamp,
            "processed_ids": sorted(processed_ids),
        }, f)


def load_workflow_for_idea(idea_id, events):
    """Find the WorkflowPlanned event for this idea_id."""
    for evt in events:
        if evt["type"] == "WorkflowPlanned" and evt["payload"].get("idea_id") == idea_id:
            return evt["payload"]
    return None


def get_completed_steps(idea_id, events):
    """Return set of step names that have successful completion events."""
    completed = set()
    for evt in events:
        payload = evt.get("payload", {})
        if payload.get("idea_id") != idea_id:
            continue
        evt_type = evt.get("type", "")
        if evt_type in COMPLETION_TYPES.values():
            for step_name, comp_type in COMPLETION_TYPES.items():
                if evt_type == comp_type:
                    completed.add(step_name)
    return completed


def get_approved_steps(idea_id, events):
    """Return set of step names that have been approved by human."""
    approved = set()
    for evt in events:
        if evt.get("type") == "StepApproved" and evt.get("payload", {}).get("idea_id") == idea_id:
            approved.add(evt["payload"].get("step"))
    return approved


def is_workflow_panicked(idea_id, events):
    """Check if a workflow has a KernelPanic event."""
    for evt in events:
        if (evt.get("type") == "KernelPanic" and
                evt.get("payload", {}).get("idea_id") == idea_id):
            return True
    return False


def write_event(evt_dict):
    """Write an event to the events directory. Returns the file path."""
    path = os.path.join(OUTPUT_DIR, f"{evt_dict['id']}.json")
    with open(path, "w") as f:
        json.dump(evt_dict, f, indent=2)
    return path


def emit_step_requested(idea_id, step_name):
    """Emit a StepRequested event for auto-advance."""
    evt = {
        "id": str(uuid.uuid4()),
        "type": "StepRequested",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        "source": "auto_advance",
        "payload": {
            "idea_id": idea_id,
            "step": step_name,
        },
    }
    path = write_event(evt)
    _log(f"Auto-advance: StepRequested for {idea_id}/{step_name} -> {os.path.basename(path)}")
    return evt


def emit_rejection_event(idea_id, step_name, reason):
    """Write a StepRejected event."""
    rejection = {
        "id": str(uuid.uuid4()),
        "type": "StepRejected",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        "source": "system",
        "payload": {
            "idea_id": idea_id,
            "step": step_name,
            "reason": reason,
        },
    }
    path = write_event(rejection)
    _log(f"REJECTED {step_name} for {idea_id}: {reason}")
    return path


def run_handler(idea_id, step_name, workflow, artifact_dir):
    """Execute a step handler and return the completion event."""
    handler_cls = HANDLERS[step_name]
    handler = handler_cls(idea_id, workflow, artifact_dir)
    result = handler.handle()
    # Write completion event if it's a dict (StepRejected events are already written)
    if isinstance(result, dict) and result.get("type") not in ("StepRejected", "KernelPanic"):
        path = write_event(result)
        _log(f"Dispatched {step_name} for {idea_id} -> {os.path.basename(path)}")
        return result
    return result


def process_step_requested(event, events, new_events):
    """Process a StepRequested event. May add auto-advance events to new_events."""
    payload = event["payload"]
    idea_id = payload.get("idea_id")
    step_name = payload.get("step")

    if not idea_id or not step_name:
        _log(f"SKIP StepRequested: missing idea_id or step")
        return

    if step_name not in HANDLERS:
        emit_rejection_event(idea_id, step_name, f"unknown step '{step_name}'")
        return

    if is_workflow_panicked(idea_id, events):
        _log(f"SKIP {step_name} for {idea_id}: workflow is in KernelPanic state")
        return

    workflow = load_workflow_for_idea(idea_id, events)
    if not workflow:
        _log(f"SKIP StepRequested: no workflow found for idea_id={idea_id}")
        return

    # State machine enforcement
    completed = get_completed_steps(idea_id, events)
    for i, s in enumerate(STEP_ORDER):
        if s == step_name:
            break
        if s not in completed:
            emit_rejection_event(
                idea_id, step_name,
                f"step '{s}' must be completed before '{step_name}'"
            )
            return

    # Idempotent check
    if step_name in completed:
        _log(f"SKIP {step_name} for {idea_id}: already completed")
        return

    # Run the handler
    completion_event = run_handler(idea_id, step_name, workflow, ARTIFACT_DIR)

    # Auto-advance: if approved and auto_advance is true and next step doesn't require review
    auto_advance = workflow.get("auto_advance", False)
    approved = get_approved_steps(idea_id, events)

    if auto_advance and step_name in approved:
        next_idx = STEP_ORDER.index(step_name) + 1
        if next_idx < len(STEP_ORDER):
            next_step = STEP_ORDER[next_idx]
            if next_step not in REVIEW_REQUIRED:
                auto_evt = emit_step_requested(idea_id, next_step)
                new_events.append(auto_evt)
                _log(f"Auto-advance queued: {next_step}")


def run_dispatcher():
    """Main dispatcher entry point."""
    _log("Starting dispatcher run")

    # LLM warmup
    _log("Warming up LLM models...")
    warmup_all()

    # Load events
    last_timestamp, processed_ids = read_offset()
    valid_events, errors = load_events(EVENT_DIR)

    if errors:
        for fname, err in errors:
            _log(f"VALIDATION ERROR {fname}: {err}")

    valid_events.sort(key=lambda e: e["timestamp"])

    # Track newly-created events for auto-advance
    new_events = []

    # Process events
    for evt in valid_events:
        if evt["id"] in processed_ids:
            continue

        if evt["type"] == "StepRequested":
            process_step_requested(evt, valid_events + new_events, new_events)

        processed_ids.add(evt["id"])
        if processed_ids:
            write_offset(evt["timestamp"], processed_ids)

    _log(f"Dispatcher run complete. Processed {len(processed_ids)} events, {len(new_events)} auto-advanced")
    return new_events


if __name__ == "__main__":
    run_dispatcher()
