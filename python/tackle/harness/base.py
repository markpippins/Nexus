"""base.py — Harness base class with direct provider invocation.

The harness pattern provides:
1. LLM invocation via tackle.inference (direct provider API calls)
2. Model resolution from tackle.db for logging/envelope metadata
3. Fallback chain support (primary → secondary → tertiary)
4. Reusable by conduit and other pipeline components

Usage:
    from tackle.harness import Harness

    class MyHarness(Harness):
        def build_prompt(self, context): ...
        def handle_response(self, response, context): ...

    harness = MyHarness(role="architect")
    result = harness.run(context)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from tackle.inference import call_llm
from tackle.db import get_role_config

log = logging.getLogger("harness")


@dataclass
class ModelConfig:
    """Resolved model configuration (for metadata/envelope)."""
    model_id: str
    model_name: str
    model_identifier: str
    provider_id: str
    provider_name: str
    provider_type: str
    endpoint_url: str | None = None
    api_key: str | None = None
    config_json: dict = field(default_factory=dict)


def resolve_role_model(role: str) -> ModelConfig | None:
    """Resolve the current model config for a role from tackle.db.

    Used for logging and completion envelope metadata. The actual LLM
    invocation is handled by tackle.inference.call_llm().
    """
    cfg = get_role_config(role)
    if not cfg:
        return None

    return ModelConfig(
        model_id=cfg.get("model_id", ""),
        model_name=cfg.get("model_name", cfg.get("model_identifier", "")),
        model_identifier=cfg.get("model_identifier", ""),
        provider_id=cfg.get("provider_id", ""),
        provider_name=cfg.get("provider_name", ""),
        provider_type=cfg.get("provider_type", ""),
        endpoint_url=cfg.get("endpoint_url"),
        api_key=cfg.get("api_key"),
        config_json=cfg.get("config_json", {}),
    )


class Harness:
    """Base harness class for LLM-driven agents.

    Subclasses must implement:
    - build_prompt(context) → str: Build the LLM prompt from context
    - handle_response(response, context) → dict: Process LLM response

    The harness provides:
    - LLM invocation via tackle.inference (direct provider API)
    - Model resolution for metadata
    - Error handling and retry logic
    """

    def __init__(self, role: str):
        self.role = role
        self._preferred_model: ModelConfig | None = None

    def load_model_info(self):
        """Resolve model config for metadata/envelope."""
        self._preferred_model = resolve_role_model(self.role)
        if self._preferred_model:
            log.info(
                "Model for %s: %s (%s)",
                self.role,
                self._preferred_model.model_name,
                self._preferred_model.model_identifier,
            )
        else:
            log.warning("No model configured for role: %s", self.role)

    @property
    def preferred_model(self) -> ModelConfig | None:
        """Return the current model config for this role."""
        return self._preferred_model

    def build_prompt(self, context: dict) -> str:
        """Build the LLM prompt from context. Must be overridden."""
        raise NotImplementedError("Subclass must implement build_prompt()")

    def handle_response(self, response: str, context: dict) -> dict:
        """Process LLM response. Must be overridden."""
        raise NotImplementedError("Subclass must implement handle_response()")

    def invoke_llm(self, prompt: str, system_prompt: str | None = None) -> str | None:
        """Invoke the LLM via tackle.inference.

        Calls the provider API directly (OpenAI, Google, Anthropic, Ollama)
        with automatic fallback chain support.
        """
        if not self._preferred_model:
            self.load_model_info()

        log.info(
            "Invoking LLM: role=%s provider=%s model=%s",
            self.role,
            self._preferred_model.provider_type if self._preferred_model else "?",
            self._preferred_model.model_identifier if self._preferred_model else "?",
        )

        try:
            response = call_llm(
                prompt,
                role=self.role,
                system_prompt=system_prompt,
                fallback=True,
            )
            if response:
                log.info("LLM response: %d chars", len(response))
            else:
                log.warning("LLM returned None for role=%s", self.role)
            return response
        except Exception as e:
            log.error("LLM invocation failed for role=%s: %s", self.role, e)
            return None

    def run(self, context: dict) -> dict:
        """Execute the harness cycle.

        1. Build prompt from context
        2. Invoke LLM with fallback
        3. Handle response
        """
        if not self._preferred_model:
            self.load_model_info()

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
