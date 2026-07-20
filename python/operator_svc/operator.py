#!/usr/bin/env python3
"""operator.operator — Core Operator logic.

Builds the system prompt, manages conversation context via a 10-item
FIFO continuity queue with session persistence, tool result caching,
and a topic map for long-term memory.
"""

import hashlib
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
from operator_svc.chat_store import log_prompt_response, save_queue, load_queue

_log = logging.getLogger("operator")

MAX_TOOL_ROUNDS = 5
CONTINUITY_QUEUE_MAX = 10
TOPIC_MAP_MAX = 50  # max items across all topics

# ── Per-Session State ─────────────────────────────────────────────
# Each session gets its own queue and topic map.
# Keyed by session_id.

_session_queues: Dict[str, deque] = {}
_session_topic_maps: Dict[str, Dict[str, List[Dict]]] = {}
_session_locks: Dict[str, threading.Lock] = {}
_global_lock = threading.Lock()


def _get_session_lock(session_id: str) -> threading.Lock:
    """Get or create a lock for a session."""
    with _global_lock:
        if session_id not in _session_locks:
            _session_locks[session_id] = threading.Lock()
        return _session_locks[session_id]


def _get_session_queue(session_id: str) -> deque:
    """Get or create a queue for a session, loading from DB if needed."""
    with _get_session_lock(session_id):
        if session_id not in _session_queues:
            # Load from DB
            db_items = load_queue(session_id)
            q = deque(maxlen=CONTINUITY_QUEUE_MAX)
            for item in db_items:
                q.append(item)
            _session_queues[session_id] = q
            _log.info("Loaded %d items for session %s", len(q), session_id)
        return _session_queues[session_id]


def _get_topic_map(session_id: str) -> Dict[str, List[Dict]]:
    """Get or create a topic map for a session."""
    with _get_session_lock(session_id):
        if session_id not in _session_topic_maps:
            _session_topic_maps[session_id] = {}
        return _session_topic_maps[session_id]


# ── Tool Result Cache ─────────────────────────────────────────────
# TTL-based cache for tool results to avoid redundant API calls.

_tool_cache: Dict[str, Dict[str, Any]] = {}
_tool_cache_lock = threading.Lock()

# TTL per service (seconds)
TOOL_CACHE_TTL = {
    "terrain": 300,   # 5 min — services don't change often
    "conduit": 120,   # 2 min — pipeline state changes moderately
    "nebula": 60,     # 1 min — agent records change frequently
}


def _cache_key(service: str, method: str, path: str, body: Any = None) -> str:
    """Generate a cache key from the request."""
    raw = f"{service}:{method}:{path}:{json.dumps(body, sort_keys=True) if body else ''}"
    return hashlib.md5(raw.encode()).hexdigest()


def _get_cached(service: str, method: str, path: str, body: Any = None) -> Optional[str]:
    """Get a cached result if available and not expired."""
    if method != "GET":
        return None  # Only cache GET requests
    key = _cache_key(service, method, path, body)
    with _tool_cache_lock:
        entry = _tool_cache.get(key)
        if entry:
            ttl = TOOL_CACHE_TTL.get(service, 60)
            if time.time() - entry["timestamp"] < ttl:
                _log.info("Cache hit: %s %s", service, path)
                return entry["result"]
            else:
                del _tool_cache[key]
    return None


def _set_cached(service: str, method: str, path: str, body: Any, result: str) -> None:
    """Store a result in the cache."""
    if method != "GET":
        return
    key = _cache_key(service, method, path, body)
    with _tool_cache_lock:
        _tool_cache[key] = {
            "result": result,
            "timestamp": time.time(),
        }


# ── Topic Map ─────────────────────────────────────────────────────

TOPIC_KEYWORDS = {
    "infrastructure": ["service", "server", "health", "status", "running", "terrain", "deploy", "port"],
    "pipeline": ["plan", "pipeline", "conduit", "work request", "ticket", "session", "circuit"],
    "requirements": ["requirement", "need", "must", "should", "backlog", "rms", "priority"],
    "architecture": ["design", "architecture", "decision", "trade", "pattern", "component"],
    "agent": ["agent", "record", "harvest", "report", "analysis", "nebula"],
}


def _detect_topic(user_message: str) -> str:
    """Detect the topic of a message based on keywords."""
    msg_lower = user_message.lower()
    scores = {}
    for topic, keywords in TOPIC_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in msg_lower)
        if score > 0:
            scores[topic] = score
    if scores:
        return max(scores, key=scores.get)
    return "general"


def _push_to_topic_map(session_id: str, item: Dict[str, Any]) -> None:
    """Push an item to the topic map when it leaves the queue."""
    topic = _detect_topic(item.get("user_message", ""))
    topic_map = _get_topic_map(session_id)
    if topic not in topic_map:
        topic_map[topic] = []
    topic_map[topic].append(item)
    # Trim topic map if too large
    total = sum(len(v) for v in topic_map.values())
    if total > TOPIC_MAP_MAX:
        # Remove oldest from smallest topic
        smallest = min(topic_map, key=lambda k: len(topic_map[k]))
        if topic_map[smallest]:
            topic_map[smallest].pop(0)


def _find_topic_context(session_id: str, user_message: str) -> List[Dict[str, Any]]:
    """Find relevant items from the topic map based on the user's message."""
    topic = _detect_topic(user_message)
    topic_map = _get_topic_map(session_id)
    items = topic_map.get(topic, [])
    # Return last 3 items from the relevant topic
    return items[-3:] if items else []


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
    """Compact a prompt/response pair into a brief summary via LLM."""
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
        return user_message[:200]


def _push_to_queue(session_id: str, user_message: str, model_response: str) -> None:
    """Compact the exchange and push to the continuity queue."""
    summary = _compact(user_message, model_response)
    if not summary:
        return

    item = {
        "summary": summary,
        "user_message": user_message[:500],
        "topic": _detect_topic(user_message),
        "timestamp": time.time(),
    }

    q = _get_session_queue(session_id)
    with _get_session_lock(session_id):
        # If queue is full, the oldest item will be pushed out
        if len(q) >= CONTINUITY_QUEUE_MAX:
            oldest = q[0]
            _push_to_topic_map(session_id, oldest)
        q.append(item)

    # Persist to DB in background
    threading.Thread(
        target=save_queue,
        args=(session_id, list(q)),
        daemon=True,
    ).start()

    _log.info(
        "Session %s queue: %d items, topic: %s",
        session_id, len(q), item["topic"],
    )


# ── Prompt Building ───────────────────────────────────────────────

def build_prompt(user_message: str, session_id: str) -> str:
    """Build the prompt string for the LLM call.

    Uses the continuity queue for recent context and the topic map
    for relevant long-term context.
    """
    parts = []

    # Add compacted history from continuity queue
    q = _get_session_queue(session_id)
    if q:
        parts.append("Previous conversation context:")
        for i, item in enumerate(q):
            parts.append(f"[{i+1}] {item['summary']}")
        parts.append("")

    # Add relevant topic map context
    topic_items = _find_topic_context(session_id, user_message)
    if topic_items:
        parts.append("Earlier discussion on this topic:")
        for item in topic_items:
            parts.append(f"  - {item['summary']}")
        parts.append("")

    # Add the new user message
    parts.append(f"User: {user_message}")

    return "\n".join(parts)


# ── Tool Call Parsing & Execution ─────────────────────────────────

def _parse_tool_call(text: str) -> Optional[Dict[str, str]]:
    """Parse a <tool_call>...</tool_call> block from LLM output."""
    match = re.search(r"<tool_call>(.*?)</tool_call>", text, re.DOTALL)
    if not match:
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
    """Execute a tool call via the API proxy with caching."""
    service = call["service"]
    method = call["method"]
    path = call["path"]
    body = None

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

    # Check cache first
    cached = _get_cached(service, method, path, body)
    if cached is not None:
        return cached

    # Execute the request
    result = proxy_request(service=service, path=path, method=method, body=body)

    if result["error"]:
        return f"Error ({result['status']}): {result['error']}"

    data = result["data"]
    text = json.dumps(data, indent=2, default=str)
    if len(text) > 8000:
        text = text[:8000] + "\n... (truncated)"

    # Cache the result
    _set_cached(service, method, path, body, text)

    return text


# ── Main Response Pipeline ────────────────────────────────────────

def respond(
    user_message: str,
    session_id: str,
    role: str = "operator",
    log_level: str = "ERROR",
) -> Dict[str, Any]:
    """Process a user message and return the operator's response."""
    start = time.time()

    # Build prompt from continuity queue + topic map
    prompt = build_prompt(user_message, session_id)

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
            break

        _log.info("Tool call: %s %s %s", tool_call["method"], tool_call["service"], tool_call["path"])
        tool_result = _execute_tool_call(tool_call)

        prompt += (
            f"\n{response_text}"
            f"\n\nTool result:\n{tool_result}"
            f"\n\nNow answer the user's question using the tool result above."
        )
    else:
        pass

    latency_ms = int((time.time() - start) * 1000)

    try:
        cfg = get_role_config(role)
        model_id = cfg.get("model_identifier", "unknown")
    except Exception:
        model_id = "unknown"

    clean_response = re.sub(r"<tool_call>.*?</tool_call>", "", response_text, flags=re.DOTALL).strip()
    clean_response = re.sub(r"<tool_call>.*", "", clean_response, flags=re.DOTALL).strip()

    # Push to continuity queue (non-blocking, includes DB persistence)
    threading.Thread(
        target=_push_to_queue,
        args=(session_id, user_message, clean_response),
        daemon=True,
    ).start()

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
