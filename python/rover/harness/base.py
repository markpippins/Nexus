"""base.py — Harness base class with model resolution and fallback.

The harness pattern provides:
1. Model resolution from tackle.models + tackle.providers
2. Fallback chain support (primary → secondary → tertiary)
3. LLM invocation via opencode CLI or direct provider API
4. Reusable by conduit and other pipeline components

Usage:
    from harness import Harness, ModelResolver

    class MyHarness(Harness):
        def build_prompt(self, context): ...
        def handle_response(self, response): ...

    harness = MyHarness(role="architect")
    result = harness.run(context)
"""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass, field
from typing import Any

import psycopg2
import psycopg2.extensions

log = logging.getLogger("harness")


@dataclass
class ModelConfig:
    """Resolved model configuration."""
    model_id: str
    model_name: str
    model_identifier: str
    provider_id: str
    provider_name: str
    provider_type: str
    endpoint_url: str | None = None
    api_key: str | None = None
    config_json: dict = field(default_factory=dict)


class ModelResolver:
    """Resolves model configuration from the database.

    Supports:
    - Direct lookup by model_id
    - Role-based lookup with fallback chain
    - Provider configuration merge
    """

    def __init__(self, conn: psycopg2.extensions.connection):
        self._conn = conn

    def resolve(self, model_id: str) -> ModelConfig | None:
        """Resolve a model by ID with full provider config."""
        cur = self._conn.cursor()
        cur.execute("""
            SELECT
                m.id, m.name, m.model_identifier,
                m.provider_id,
                p.name as provider_name,
                p.type as provider_type,
                p.endpoint_url,
                p.api_key,
                p.config_json
            FROM tackle.models m
            JOIN tackle.providers p ON p.id = m.provider_id
            WHERE m.id = %s
        """, (model_id,))
        row = cur.fetchone()
        cur.close()

        if not row:
            return None

        return ModelConfig(
            model_id=row[0],
            model_name=row[1],
            model_identifier=row[2],
            provider_id=row[3],
            provider_name=row[4],
            provider_type=row[5],
            endpoint_url=row[6],
            api_key=row[7],
            config_json=json.loads(row[8]) if row[8] else {},
        )

    def resolve_for_role(self, role: str) -> list[ModelConfig]:
        """Resolve models for a role, ordered by fallback priority.

        Looks up tackle.agent_scheduler for the role's model_id,
        then checks for fallback configuration in agent_config.
        """
        cur = self._conn.cursor()
        cur.execute("""
            SELECT model_id, agent_config
            FROM tackle.agent_scheduler
            WHERE role = %s AND enabled = 1
            LIMIT 1
        """, (role,))
        row = cur.fetchone()
        cur.close()

        if not row or not row[0]:
            return []

        model_id, agent_config_raw = row
        agent_config = json.loads(agent_config_raw) if agent_config_raw else {}

        models = []

        # Primary model
        primary = self.resolve(model_id)
        if primary:
            models.append(primary)

        # Fallback models from agent_config
        fallback_ids = agent_config.get("fallback_models", [])
        for fb_id in fallback_ids:
            fb = self.resolve(fb_id)
            if fb:
                models.append(fb)

        return models


class Harness:
    """Base harness class for LLM-driven agents.

    Subclasses must implement:
    - build_prompt(context) → str: Build the LLM prompt from context
    - handle_response(response, context) → dict: Process LLM response

    The harness provides:
    - Model resolution with fallback
    - LLM invocation via opencode or direct API
    - Error handling and retry logic
    """

    def __init__(self, role: str, conn: psycopg2.extensions.connection | None = None):
        self.role = role
        self._conn = conn
        self._models: list[ModelConfig] = []
        self._model_resolver: ModelResolver | None = None

    def connect(self, conn: psycopg2.extensions.connection):
        """Set database connection and initialize model resolver."""
        self._conn = conn
        self._model_resolver = ModelResolver(conn)

    def load_models(self):
        """Load model fallback chain for this role."""
        if not self._model_resolver:
            raise RuntimeError("Harness not connected — call connect() first")

        self._models = self._model_resolver.resolve_for_role(self.role)
        if not self._models:
            log.warning("No models configured for role: %s", self.role)
        else:
            log.info(
                "Models for %s: %s",
                self.role,
                " → ".join(m.model_name for m in self._models),
            )

    @property
    def preferred_model(self) -> ModelConfig | None:
        """Return the primary model for this role."""
        return self._models[0] if self._models else None

    def build_prompt(self, context: dict) -> str:
        """Build the LLM prompt from context. Must be overridden."""
        raise NotImplementedError("Subclass must implement build_prompt()")

    def handle_response(self, response: str, context: dict) -> dict:
        """Process LLM response. Must be overridden."""
        raise NotImplementedError("Subclass must implement handle_response()")

    def invoke_llm(self, prompt: str, model: ModelConfig | None = None) -> str | None:
        """Invoke the LLM via opencode CLI.

        Falls back through the model chain on failure.
        """
        models_to_try = [model] if model else self._models

        for m in models_to_try:
            try:
                result = self._invoke_opencode(prompt, m)
                if result:
                    return result
            except Exception as e:
                log.warning(
                    "Model %s failed: %s — trying next",
                    m.model_name, str(e)[:100],
                )
                continue

        log.error("All models failed for role: %s", self.role)
        return None

    def _invoke_opencode(self, prompt: str, model: ModelConfig) -> str | None:
        """Invoke opencode with the given model and prompt."""
        model_ref = f"{model.provider_type}/{model.model_identifier}"

        cmd = [
            "/home/codex/.opencode/bin/opencode",
            "run",
            "--model", model_ref,
            "--agent", self.role,
            "--format", "json",
            prompt,
        ]

        log.info("Invoking: opencode --model %s --agent %s", model_ref, self.role)

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            cwd="/home/codex/dev",
        )

        if result.returncode != 0:
            raise RuntimeError(f"opencode failed: {result.stderr[:200]}")

        # Parse JSON events from opencode output
        return self._parse_opencode_output(result.stdout)

    def _parse_opencode_output(self, stdout: str) -> str | None:
        """Parse opencode JSON output and extract the final response."""
        lines = stdout.strip().splitlines()
        text_parts = []

        for line in lines:
            try:
                event = json.loads(line)
                if event.get("type") == "text":
                    text_parts.append(event.get("content", ""))
                elif event.get("type") == "message":
                    content = event.get("content", "")
                    if isinstance(content, str):
                        text_parts.append(content)
            except json.JSONDecodeError:
                continue

        return "\n".join(text_parts) if text_parts else None

    def run(self, context: dict) -> dict:
        """Execute the harness cycle.

        1. Build prompt from context
        2. Invoke LLM with fallback
        3. Handle response
        """
        if not self._models:
            self.load_models()

        prompt = self.build_prompt(context)
        log.info("Prompt length: %d chars", len(prompt))

        response = self.invoke_llm(prompt)
        if not response:
            return {"success": False, "error": "No LLM response"}

        log.info("Response length: %d chars", len(response))

        try:
            result = self.handle_response(response, context)
            result["success"] = True
            return result
        except Exception as e:
            log.error("handle_response failed: %s", e)
            return {"success": False, "error": str(e)}
