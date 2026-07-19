#!/usr/bin/env python3
"""operator.operator — Core Operator logic.

Builds the system prompt, manages conversation context,
and calls tackle.inference for LLM responses.
"""

import json
import logging
import os
import sys
import time
from typing import Any, Dict, List, Optional

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_TACKLE_PARENT = os.path.dirname(_SCRIPT_DIR)  # nexus/python/
if _TACKLE_PARENT not in sys.path:
    sys.path.insert(0, _TACKLE_PARENT)

from tackle.inference import call_llm
from tackle.db import get_role_config

from operator_svc.chat_store import log_prompt_response, get_session_history

_log = logging.getLogger("operator")

# ── Operator System Prompt ────────────────────────────────────────

SYSTEM_PROMPT = """You are Operator, the host personality for the Nexus system.

You are the friendly, knowledgeable interface between the user and the Nexus
infrastructure. You can:

- Answer questions about the Nexus system, its services, and its architecture
- Help users understand pipeline state, requirements, and implementation plans
- Provide status updates on services and agents
- Assist with navigation across the Nexus UI set

You have access to Nexus APIs through the proxy system. When a user asks
about system state, you can query the relevant services.

Be concise, helpful, and direct. You are not a general-purpose chatbot —
you are the Nexus operator. Stay in character.

When you don't know something, say so. When you can help by querying a
service, say what you're going to do before doing it."""


def build_prompt(
    user_message: str,
    session_id: str,
    context_limit: int = 20,
) -> str:
    """Build the prompt string for the LLM call.

    Includes conversation history from the DB and the new user message.
    call_llm() handles the system_prompt separately.
    """
    parts = []

    # Load history from DB
    history = get_session_history(session_id, limit=context_limit)
    for entry in history:
        if entry["user_message"]:
            parts.append(f"User: {entry['user_message']}")
        if entry["model_response"]:
            parts.append(f"Operator: {entry['model_response']}")

    # Add the new user message
    parts.append(f"User: {user_message}")

    return "\n".join(parts)


def respond(
    user_message: str,
    session_id: str,
    role: str = "operator",
    log_level: str = "ERROR",
) -> Dict[str, Any]:
    """Process a user message and return the operator's response.

    Returns dict with keys: response, model_identifier, latency_ms
    """
    start = time.time()

    # Build prompt with history
    prompt = build_prompt(user_message, session_id)

    # Call the LLM via tackle's inference module
    try:
        response_text = call_llm(
            prompt=prompt,
            role=role,
            system_prompt=SYSTEM_PROMPT,
            fallback=True,
        )
    except Exception as e:
        _log.error("LLM call failed: %s", e)
        response_text = f"[Operator] I encountered an error: {e}"

    latency_ms = int((time.time() - start) * 1000)

    # Get model info for logging
    try:
        cfg = get_role_config(role)
        model_id = cfg.get("model_identifier", "unknown")
    except Exception:
        model_id = "unknown"

    # Log to database
    log_prompt_response(
        session_id=session_id,
        user_message=user_message,
        model_response=response_text or "",
        role=role,
        model_identifier=model_id,
        latency_ms=latency_ms,
    )

    return {
        "response": response_text or "",
        "model_identifier": model_id,
        "latency_ms": latency_ms,
    }
