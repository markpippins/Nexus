#!/usr/bin/env python3
"""operator.operator — Core Operator logic.

Builds the system prompt, manages conversation context via a 10-item
FIFO continuity queue, and calls tackle.inference for LLM responses
with tool-calling loop.
"""

import json
import logging
import os
import re
import sys
import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_TACKLE_PARENT = os.path.dirname(_SCRIPT_DIR)  # nexus/python/
if _TACKLE_PARENT not in sys.path:
    sys.path.insert(0, _TACKLE_PARENT)

from tackle.inference import call_llm
from tackle.db import get_role_config

from operator_svc.api_proxy import proxy_request
from operator_svc.chat_store import log_prompt_response

_log = logging.getLogger("operator")

MAX_TOOL_ROUNDS = 5
CONTINUITY_QUEUE_MAX = 10

# ── Continuity Queue ──────────────────────────────────────────────
# In-memory FIFO of compacted conversation summaries.
# Each item is a dict: {summary, user_message, timestamp}

_continuity_queue: deque = deque(maxlen=CONTINUITY_QUEUE_MAX)

# ── Tool Definitions ──────────────────────────────────────────────

TOOLS = [
    {
        "name": "query_nebula",
        "description": "Query the Nebula agent records service. Use for: agent records, requirements, harvests, reports, analyses, open questions.",
        "endpoints": [
            "GET  /api/agent-records          — list records (query: role, tag, type, limit)",
            "GET  /api/requirements            — list requirements (query: status, priority, limit)",
            "GET  /api/harvests                — list harvests (query: limit)",
            "GET  /api/open-questions          — list open questions (query: status, limit)",
            "GET  /api/agent-records/:id       — get single record by ID",
        ],
    },
    {
        "name": "query_conduit",
        "description": "Query the Conduit pipeline service. Use for: plans, tickets, sessions, work requests, pipeline status.",
        "endpoints": [
            "GET  /state                       — full pipeline state (plans, tickets, sessions)",
            "GET  /wr                          — list work requests (query: status, limit)",
            "GET  /wr/:id                      — get work request by ID",
            "GET  /wr/:id/events               — get event log for a work request",
            "GET  /wr/:id/projection-drift     — check projection drift for a work request",
            "GET  /health                      — conduit health check",
        ],
    },
    {
        "name": "query_terrain",
        "description": "Query the Terrain infrastructure topology service. Use for: runnable services, service types, servers, service dependencies, platform health.",
        "endpoints": [
            "GET  /api/v1/runnable-services          — list all registered services",
            "GET  /api/v1/runnable-services/:id       — get service by ID",
            "GET  /api/v1/service-types                — list service types",
            "GET  /api/v1/servers                     — list servers",
            "GET  /api/v1/service-dependencies        — list service dependencies",
            "GET  /api/v1/platform/health             — platform health check",
        ],
    },
]


# ── Operator System Prompt ────────────────────────────────────────

SYSTEM_PROMPT = """You are Operator, the host personality for the Nexus system.

You are the friendly, knowledgeable interface between the user and the Nexus
infrastructure. You can answer questions about pipeline state, requirements,
implementation plans, service status, and architecture.

## Tools

You have access to Nexus backend services via tool calls. To use a tool,
output EXACTLY this format (one call at a time):

<tool_call>
service: <query_nebula|query_conduit|query_terrain>
method: <GET|POST>
path: <API path>
body: <JSON object or omit for GET>
</tool_call>

After you make a tool call, you will receive the ACTUAL data from the service.
CRITICAL: You MUST use the actual data in your response. Do NOT generate, fabricate,
or invent data. If the tool returns JSON, summarize what it contains. If it returns
an error, report the error. Never make up agent records, plans, requirements, or
any other data — only report what the tool actually returned.

Available tools:
- query_nebula: agent records, requirements, harvests, reports, open questions
  Paths: /api/agent-records, /api/requirements, /api/harvests, /api/open-questions
- query_conduit: plans, tickets, sessions, work requests, pipeline status
  Paths: /state, /wr, /wr/:id, /health
- query_terrain: service status, infrastructure state
  Paths: /api/v1/runnable-services, /api/v1/service-types, /api/v1/servers, /api/v1/platform/health

## Behavior

- Be concise, helpful, and direct.
- When you need data to answer a question, make a tool call first.
- When you receive tool results, report what they actually contain.
- When you don't know something, say so. Don't make up data.
- Stay in character as the Nexus operator."""


# ── Compaction ────────────────────────────────────────────────────

COMPACTION_PROMPT_TEMPLATE = """Summarize this conversation exchange in 2-3 sentences. \
Focus on: what the user asked, what data was retrieved (if any), and what the answer was. \
Be factual and concise. Do not add opinions or interpretation.

User: {user_message}

Operator: {model_response}"""


def _compact(user_message: str, model_response: str) -> str:
    """Compact a prompt/response pair into a brief summary via LLM.

    Uses the operator role with a short, focused prompt to produce
    a 2-3 sentence summary suitable for the continuity queue.
    """
    prompt = COMPACTION_PROMPT_TEMPLATE.format(
        user_message=user_message[:2000],
        model_response=model_response[:2000],
    )
    try:
        summary = call_llm(
            prompt=prompt,
            role="operator",
            system_prompt="You are a summarization assistant. Produce only the summary, nothing else.",
            fallback=True,
        )
        return (summary or "").strip()
    except Exception as e:
        _log.warning("Compaction failed: %s", e)
        # Fallback: truncate the user message
        return user_message[:200]


def _push_to_queue(user_message: str, model_response: str) -> None:
    """Compact the exchange and push to the continuity queue."""
    summary = _compact(user_message, model_response)
    if summary:
        _continuity_queue.append({
            "summary": summary,
            "user_message": user_message[:500],
            "timestamp": time.time(),
        })
        _log.info(
            "Continuity queue: %d items, latest: %.80s...",
            len(_continuity_queue), summary,
        )


# ── Prompt Building ───────────────────────────────────────────────

def build_prompt(user_message: str) -> str:
    """Build the prompt string for the LLM call.

    Uses the continuity queue for context. Each queue item is presented
    as a compacted summary of a prior exchange.

    call_llm() handles the system_prompt separately.
    """
    parts = []

    # Add compacted history from continuity queue
    if _continuity_queue:
        parts.append("Previous conversation context:")
        for i, item in enumerate(_continuity_queue):
            parts.append(f"[{i+1}] {item['summary']}")
        parts.append("")

    # Add the new user message
    parts.append(f"User: {user_message}")

    return "\n".join(parts)


# ── Tool Call Parsing & Execution ─────────────────────────────────

def _parse_tool_call(text: str) -> Optional[Dict[str, str]]:
    """Parse a <tool_call>...</tool_call> block from LLM output.

    Handles both cases: with and without closing  tag.
    Returns dict with keys: service, method, path, body (optional)
    or None if no tool call found.
    """
    # Try with closing tag first
    match = re.search(r"<tool_call>(.*?)</tool_call>", text, re.DOTALL)
    if not match:
        # Try without closing tag — match from <tool_call> to end of text
        match = re.search(r"<tool_call>(.*)", text, re.DOTALL)
    if not match:
        return None

    block = match.group(1)
    call: Dict[str, str] = {}
    for line in block.strip().splitlines():
        line = line.strip()
        if ":" in line:
            key, _, value = line.partition(":")
            key = key.strip().lower()
            value = value.strip()
            if key in ("service", "method", "path", "body"):
                call[key] = value

    if "service" not in call or "path" not in call:
        return None

    if "method" not in call:
        call["method"] = "GET"

    return call


def _execute_tool_call(call: Dict[str, str]) -> str:
    """Execute a tool call via the API proxy.

    Returns a string summary of the result for the LLM to consume.
    """
    service = call["service"]
    method = call["method"]
    path = call["path"]
    body = None

    # Map tool names to actual service names
    SERVICE_ALIAS = {
        "query_nebula": "nebula",
        "query_conduit": "conduit",
        "query_terrain": "terrain",
    }
    service = SERVICE_ALIAS.get(service, service)

    if "body" in call and method != "GET":
        try:
            body = json.loads(call["body"])
        except json.JSONDecodeError:
            return f"Error: invalid JSON body: {call['body']}"

    result = proxy_request(service=service, path=path, method=method, body=body)

    if result["error"]:
        return f"Error ({result['status']}): {result['error']}"

    data = result["data"]
    # Truncate very large responses to stay within context window
    text = json.dumps(data, indent=2, default=str)
    if len(text) > 8000:
        text = text[:8000] + "\n... (truncated)"

    return text


# ── Main Response Pipeline ────────────────────────────────────────

def respond(
    user_message: str,
    session_id: str,
    role: str = "operator",
    log_level: str = "ERROR",
) -> Dict[str, Any]:
    """Process a user message and return the operator's response.

    1. Build prompt from continuity queue + new message
    2. Run tool-calling loop (up to MAX_TOOL_ROUNDS)
    3. Compact the exchange and push to continuity queue
    4. Log to database for audit trail

    Returns dict with keys: response, model_identifier, latency_ms
    """
    start = time.time()

    # Build prompt from continuity queue
    prompt = build_prompt(user_message)

    # Tool-calling loop
    response_text = ""
    for round_num in range(MAX_TOOL_ROUNDS):
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
            break

        tool_call = _parse_tool_call(response_text)
        if tool_call is None:
            # No tool call — this is the final answer
            break

        # Execute the tool call and append result to prompt
        _log.info("Tool call: %s %s %s", tool_call["method"], tool_call["service"], tool_call["path"])
        tool_result = _execute_tool_call(tool_call)

        # Append the tool call and result to the prompt for the next round
        prompt += (
            f"\n{response_text}"
            f"\n\nTool result:\n{tool_result}"
            f"\n\nNow answer the user's question using the tool result above."
        )
    else:
        # Exhausted all rounds — return whatever we have
        pass

    latency_ms = int((time.time() - start) * 1000)

    # Get model info for logging
    try:
        cfg = get_role_config(role)
        model_id = cfg.get("model_identifier", "unknown")
    except Exception:
        model_id = "unknown"

    # Strip any remaining tool call blocks from the final response
    clean_response = re.sub(r"<tool_call>.*?</tool_call>", "", response_text, flags=re.DOTALL).strip()
    clean_response = re.sub(r"<tool_call>.*", "", clean_response, flags=re.DOTALL).strip()

    # Compact and push to continuity queue (non-blocking)
    threading.Thread(target=_push_to_queue, args=(user_message, clean_response), daemon=True).start()

    # Log to database for audit trail
    log_prompt_response(
        session_id=session_id,
        user_message=user_message,
        model_response=clean_response or "",
        role=role,
        model_identifier=model_id,
        latency_ms=latency_ms,
    )

    return {
        "response": clean_response or "",
        "model_identifier": model_id,
        "latency_ms": latency_ms,
    }
