from handlers.base import StepHandler


class VocabularyHandler(StepHandler):
    step_name = "vocabulary"
    completion_type = "VocabularyDrafted"

    def handle(self):
        idea = self.workflow.get("idea", "")
        vocabulary = self.workflow.get("vocabulary", {})

        content = {
            "idea_id": self.idea_id,
            "source_idea": idea,
            "entities": vocabulary.get("entities", {}),
            "actions": vocabulary.get("actions", {}),
            "states": vocabulary.get("states", {}),
            "constraints": vocabulary.get("constraints", {}),
        }
        path = self._write_artifact("vocabulary.json", content)
        return self._completion_event(path)
