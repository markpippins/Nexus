"""Prompt templates for the agentic pipeline steps.

Each template is a callable that takes context and returns the full prompt string.
"""


def vocabulary_prompt(idea, existing_vocabulary=None):
    return f"""You are a domain analysis expert. Given an idea, extract a structured vocabulary.

Analyze this idea and produce:
1. **entities**: Key domain concepts and their definitions
2. **actions**: Verbs/operations in the domain
3. **states**: Lifecycle stages of entities
4. **constraints**: Rules and limitations

Respond as a single JSON object with these exact keys: "entities", "actions", "states", "constraints".
Each value should be a dictionary mapping names to their definitions.

Idea:
{idea}

Return ONLY the JSON object. No explanations, no markdown.
"""


def requirements_prompt(idea, vocabulary):
    vocab_text = ""
    if vocabulary:
        entities = vocabulary.get("entities", {})
        actions = vocabulary.get("actions", {})
        vocab_text = "\nEntities: " + ", ".join(entities.keys()) if entities else ""
        vocab_text += "\nActions: " + ", ".join(actions.keys()) if actions else ""

    return f"""You are a requirements analyst. Given an idea and its domain vocabulary, derive clear functional requirements.

Each requirement should be a single sentence describing a specific capability the system must have.

Idea: {idea}
{vocab_text}

Respond as JSON with:
{{
  "functional_requirements": [
    {{ "id": "FR-1", "description": "...", "source_entity": "..." }},
    ...
  ]
}}

Return ONLY the JSON object. No explanations, no markdown.
"""


def typespec_prompt(idea, requirements, vocabulary=None):
    req_text = ""
    if requirements:
        for req in requirements:
            req_text += f"- [{req.get('id', '?')}] {req.get('description', '')}\n"

    return f"""You are a TypeSpec architect. Given functional requirements, produce a TypeSpec (.tsp) file that defines the service contracts.

Requirements:
{req_text}

Produce valid TypeSpec that defines:
- Models for each domain entity
- Operations for each action
- Appropriate types, validation, and relationships

Return the response as:
{{
  "typespec_source": "the full TypeSpec code as a string"
}}

Return ONLY the JSON object. No explanations, no markdown.
"""


def refactor_prompt(idea, compiled_artifact, existing_code_context=None):
    return f"""You are a refactoring specialist. Given compiled TypeSpec artifacts and existing code, produce a plan for integrating the new contracts into the existing codebase.

Idea: {idea}

Compiled artifact summary:
{json.dumps(compiled_artifact, indent=2) if compiled_artifact else "None available"}

{f"Existing code context:\n{existing_code_context}" if existing_code_context else ""}

Respond as JSON:
{{
  "files_to_modify": ["path/to/file1", ...],
  "new_files": ["path/to/new1", ...],
  "modifications": [
    {{ "file": "...", "change_type": "add|modify|delete", "description": "..." }}
  ],
  "risks": ["description of potential issues"]
}}

Return ONLY the JSON object. No explanations, no markdown.
"""


PROMPTS = {
    "vocabulary": vocabulary_prompt,
    "requirements": requirements_prompt,
    "typespec": typespec_prompt,
    "refactor": refactor_prompt,
}
