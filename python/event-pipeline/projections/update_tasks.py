import json, os, sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
sys.path.insert(0, PROJECT_ROOT)

EVENT_DIR = os.path.join(PROJECT_ROOT, "events")
PROJ_FILE = os.path.join(PROJECT_ROOT, "projections", "tasks_by_priority.json")

from validators.loader import load_events

STEP_ORDER = [
    "VocabularyDrafted",
    "RequirementsFormalized",
    "TypeSpecDrafted",
    "SpecCompiled",
    "RefactorDrafted",
    "Integrated",
]

STEP_LABELS = {
    "VocabularyDrafted": "vocabulary",
    "RequirementsFormalized": "requirements",
    "TypeSpecDrafted": "typespec",
    "SpecCompiled": "compile",
    "RefactorDrafted": "refactor",
    "Integrated": "integrate",
}

STEP_STATES = {
    "vocabulary": "draft",
    "requirements": "specified",
    "typespec": "specified",
    "compile": "compiled",
    "refactor": "integrated",
    "integrate": "integrated",
}

workflows = {}

# Load and validate all events
valid_events, errors = load_events(EVENT_DIR)
if errors:
    for fname, err in errors:
        print(f"  VALIDATION WARNING {fname}: {err}")

valid_events.sort(key=lambda e: e["timestamp"])

for evt in valid_events:
    if evt["type"] == "WorkflowPlanned":
        payload = evt["payload"]
        steps = {}
        for s in payload["steps"]:
            steps[s["step"]] = {
                "status": "pending",
                "state": s["state"],
                "event_type": s["event_type"],
                "next_action": s.get("next_action"),
            }
        workflows[payload["idea_id"]] = {
            "idea": payload["idea"],
            "vocabulary_path": payload.get("vocabulary_path"),
            "auto_advance": payload.get("auto_advance", False),
            "steps": steps,
        }

    elif evt["type"] in STEP_ORDER:
        # A step draft was produced — awaiting human approval
        idea_id = evt.get("payload", {}).get("idea_id")
        if idea_id and idea_id in workflows:
            step_name = STEP_LABELS[evt["type"]]
            if step_name in workflows[idea_id]["steps"]:
                workflows[idea_id]["steps"][step_name]["status"] = "pending_approval"
                workflows[idea_id]["steps"][step_name]["artifact_path"] = evt["payload"].get("artifact_path")

    elif evt["type"] == "StepApproved":
        idea_id = evt.get("payload", {}).get("idea_id")
        step_name = evt.get("payload", {}).get("step")
        if idea_id and idea_id in workflows and step_name in workflows[idea_id]["steps"]:
            workflows[idea_id]["steps"][step_name]["status"] = "approved"

    elif evt["type"] == "StepRejected":
        idea_id = evt.get("payload", {}).get("idea_id")
        step_name = evt.get("payload", {}).get("step")
        reason = evt.get("payload", {}).get("reason", "")
        if idea_id and idea_id in workflows and step_name in workflows[idea_id]["steps"]:
            step = workflows[idea_id]["steps"][step_name]
            if step["status"] == "pending_approval":
                # Rejected the current step — back to pending for redo
                step["status"] = "pending"
            step["rejection_reason"] = reason

    elif evt["type"] == "KernelPanic":
        idea_id = evt.get("payload", {}).get("idea_id")
        if idea_id and idea_id in workflows:
            workflows[idea_id]["kernel_panic"] = True
            workflows[idea_id]["panic_reason"] = evt["payload"].get("reason", "")
            workflows[idea_id]["auto_advance"] = False

    elif evt["type"] == "IdeaCaptured":
        # Check for auto_advance override in metadata
        meta = evt.get("_meta", {})
        idea_id = evt.get("id")
        if idea_id and idea_id in workflows:
            if "auto_advance" in meta:
                workflows[idea_id]["auto_advance"] = meta["auto_advance"]

# Compute current_step: first step that is pending or pending_approval
for idea_id, wf in workflows.items():
    wf["current_step"] = None
    for step_type in STEP_ORDER:
        step_name = STEP_LABELS[step_type]
        status = wf["steps"][step_name]["status"]
        if status in ("pending", "pending_approval"):
            wf["current_step"] = step_name
            break
    if wf["current_step"] is None:
        # All approved = complete; all rejected = stuck
        all_approved = all(wf["steps"][s]["status"] == "approved" for s in STEP_LABELS.values())
        wf["current_step"] = "complete" if all_approved else "rejected"

# Write projection
os.makedirs(os.path.dirname(PROJ_FILE), exist_ok=True)
with open(PROJ_FILE, "w") as f:
    json.dump(list(workflows.values()), f, indent=2)

print(f"Projection updated: {PROJ_FILE}")
