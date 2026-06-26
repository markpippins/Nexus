import json, os, sys, uuid, datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
sys.path.insert(0, PROJECT_ROOT)

EVENT_DIR = os.path.join(PROJECT_ROOT, "events")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "events")
OFFSET_DIR = os.path.join(PROJECT_ROOT, "offsets", "architect")

from validators.loader import load_events

# ── Phase 1: NATS sidecar lifecycle (per-subprocess) ──
_NATS_URL = os.getenv("NATS_URL")

def _start_nats():
    if _NATS_URL:
        try:
            from nats_publisher import start_nats_sidecar
            start_nats_sidecar(_NATS_URL)
        except ImportError:
            pass

def _stop_nats():
    if _NATS_URL:
        try:
            from nats_publisher import stop_nats_sidecar
            stop_nats_sidecar()
        except ImportError:
            pass


def _enqueue_nats_if_available(evt_dict, **kwargs):
    """Enqueue an event for NATS publish if the sidecar is available.

    Phase 1: Non-breaking addition — silently skipped if nats_publisher
    module is not deployed or NATS is unavailable.

    All extra keyword args (causation_id, correlation_id, etc.) are
    forwarded through to the CanonicalEnvelope adapter.
    """
    try:
        from nats_publisher import try_enqueue_event
        try_enqueue_event(evt_dict, **kwargs)
    except ImportError:
        pass  # nats_publisher not installed yet — safe to skip

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

DEFAULT_EVENT_BINDINGS = {
    "IdeaCaptured": {"produces_state": "draft", "next_action": "formalize_spec"},
    "SpecCompiled": {"produces_state": "compiled", "next_action": "intelligent_refactor"},
}

DEFAULT_STEP_SEQUENCE = [
    {"step": "vocabulary", "event_type": "VocabularyDrafted", "state": "draft"},
    {"step": "requirements", "event_type": "RequirementsFormalized", "state": "specified"},
    {"step": "typespec", "event_type": "TypeSpecDrafted", "state": "specified"},
    {"step": "compile", "event_type": "SpecCompiled", "state": "compiled"},
    {"step": "refactor", "event_type": "RefactorDrafted", "state": "integrated"},
    {"step": "integrate", "event_type": "Integrated", "state": "integrated"},
]

def build_workflow_steps(vocabulary):
    event_bindings = vocabulary.get("event_bindings", DEFAULT_EVENT_BINDINGS)
    step_sequence = DEFAULT_STEP_SEQUENCE

    # Map: trigger event → step index
    TRIGGER_TO_STEP = {
        "IdeaCaptured": 0,       # triggers the vocabulary capture step
    }
    EVENT_TYPE_TO_STEP = {s["event_type"]: i for i, s in enumerate(step_sequence)}

    steps = [{"step": s["step"], "event_type": s["event_type"], "state": s["state"],
              "next_action": None, "status": "pending"} for s in step_sequence]

    for event_type, binding in event_bindings.items():
        if event_type in TRIGGER_TO_STEP:
            idx = TRIGGER_TO_STEP[event_type]
            steps[idx]["state"] = binding["produces_state"]
            steps[idx]["next_action"] = binding["next_action"]
        elif event_type in EVENT_TYPE_TO_STEP:
            idx = EVENT_TYPE_TO_STEP[event_type]
            steps[idx]["state"] = binding["produces_state"]
            steps[idx]["next_action"] = binding["next_action"]

    return steps

def process_event(event):
    if event["type"] == "IdeaCaptured":
        workflow_vocabulary = event["payload"].get("workflow_vocabulary", {})
        steps = build_workflow_steps(workflow_vocabulary)

        # Store vocabulary as artifact for downstream handlers
        artifact_path = os.path.join(OUTPUT_DIR, "..", "artifacts", event["id"], "workflow_vocabulary.json")
        artifact_path = os.path.normpath(artifact_path)
        os.makedirs(os.path.dirname(artifact_path), exist_ok=True)
        with open(artifact_path, "w") as f:
            json.dump(workflow_vocabulary, f, indent=2)

        next_event = {
            "id": str(uuid.uuid4()),
            "type": "WorkflowPlanned",
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "source": "agent",
            "payload": {
                "idea_id": event["id"],
                "idea": event["payload"]["idea"],
                "vocabulary_path": os.path.relpath(artifact_path, PROJECT_ROOT),
                "auto_advance": event.get("_meta", {}).get("auto_advance", True),
                "steps": steps,
            }
        }
        new_file = os.path.join(OUTPUT_DIR, f"{next_event['id']}.json")
        with open(new_file, "w") as f:
            json.dump(next_event, f, indent=2)
        print(f"Emitted event: {new_file}")

        # ── Phase 1: Enqueue for NATS publish (canonical envelope) ──
        _enqueue_nats_if_available(
            next_event,
            causation_id=event["id"],  # WorkflowPlanned caused by this IdeaCaptured
        )

_start_nats()
try:
    last_timestamp, processed_ids = read_offset()
    valid_events, errors = load_events(EVENT_DIR)
    if errors:
        for fname, err in errors:
            print(f"  VALIDATION ERROR {fname}: {err}")

    valid_events.sort(key=lambda e: e["timestamp"])

    for evt in valid_events:
        if evt["id"] in processed_ids:
            continue

        process_event(evt)
        processed_ids.add(evt["id"])
        write_offset(evt["timestamp"], processed_ids)
finally:
    _stop_nats()
