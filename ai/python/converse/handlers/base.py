import json, os, uuid, datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)


class StepHandler:
    """Base class for workflow step handlers. Subclasses implement handle()."""

    step_name = None       # e.g. "vocabulary"
    completion_type = None # e.g. "VocabularyDrafted"

    def __init__(self, idea_id, workflow_payload, artifact_dir):
        self.idea_id = idea_id
        self.workflow = workflow_payload
        self.artifact_dir = artifact_dir

    def _artifact_path(self, filename):
        return os.path.join(self.artifact_dir, self.idea_id, filename)

    def _write_artifact(self, filename, content):
        path = self._artifact_path(filename)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(content, f, indent=2)
        return path

    def _completion_event(self, artifact_path, payload_extra=None):
        evt = {
            "id": str(uuid.uuid4()),
            "type": self.completion_type,
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "source": "agent",
            "payload": {
                "idea_id": self.idea_id,
                "step": self.step_name,
                "artifact_path": artifact_path,
                **(payload_extra or {}),
            },
        }
        return evt

    def load_prior_artifact(self, filename, default=None):
        """Load an artifact from a prior step for this idea_id."""
        path = os.path.join(self.artifact_dir, self.idea_id, filename)
        if not os.path.exists(path):
            return default
        try:
            with open(path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return default

    def handle(self):
        """Override to produce artifact and return completion event dict."""
        raise NotImplementedError
