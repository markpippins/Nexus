#!/usr/bin/env python3
"""operator.operator — Core Operator logic.

Builds the system prompt, manages conversation context via a 10-item
FIFO continuity queue with session persistence, tool result caching,
and a hybrid topic+entity index for long-term memory.
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
from typing import Any, Dict, List, Optional, Set

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
ENTITY_INDEX_MAX = 100  # max items across all entities
SHORT_EXCHANGE_THRESHOLD = 200  # chars — skip LLM compaction below this

# ── Per-Session State ─────────────────────────────────────────────

_session_queues: Dict[str, deque] = {}
_session_entity_indexes: Dict[str, Dict[str, List[Dict]]] = {}
_session_topic_maps: Dict[str, Dict[str, List[Dict]]] = {}
_session_locks: Dict[str, threading.Lock] = {}
_global_lock = threading.Lock()


def _get_session_lock(session_id: str) -> threading.Lock:
    with _global_lock:
        if session_id not in _session_locks:
            _session_locks[session_id] = threading.Lock()
        return _session_locks[session_id]


def _get_session_queue(session_id: str) -> deque:
    with _get_session_lock(session_id):
        if session_id not in _session_queues:
            db_items = load_queue(session_id)
            q = deque(maxlen=CONTINUITY_QUEUE_MAX)
            for item in db_items:
                q.append(item)
            _session_queues[session_id] = q
            _log.info("Loaded %d items for session %s", len(q), session_id)
        return _session_queues[session_id]


def _get_entity_index(session_id: str) -> Dict[str, List[Dict]]:
    with _get_session_lock(session_id):
        if session_id not in _session_entity_indexes:
            _session_entity_indexes[session_id] = {}
        return _session_entity_indexes[session_id]


def _get_topic_map(session_id: str) -> Dict[str, List[Dict]]:
    with _get_session_lock(session_id):
        if session_id not in _session_topic_maps:
            _session_topic_maps[session_id] = {}
        return _session_topic_maps[session_id]


# ── Tool Result Cache ─────────────────────────────────────────────

_tool_cache: Dict[str, Dict[str, Any]] = {}
_tool_cache_lock = threading.Lock()

TOOL_CACHE_TTL = {
    "terrain": 300,
    "conduit": 120,
    "nebula": 60,
}


def _cache_key(service: str, method: str, path: str, body: Any = None) -> str:
    raw = f"{service}:{method}:{path}:{json.dumps(body, sort_keys=True) if body else ''}"
    return hashlib.md5(raw.encode()).hexdigest()


def _get_cached(service: str, method: str, path: str, body: Any = None) -> Optional[str]:
    if method != "GET":
        return None
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
    if method != "GET":
        return
    key = _cache_key(service, method, path, body)
    with _tool_cache_lock:
        _tool_cache[key] = {"result": result, "timestamp": time.time()}


# ── Regex Entity Extraction ───────────────────────────────────────

# Known service names from terrain
KNOWN_SERVICES = {
    "nats", "postgresql", "address-tts", "broker-gateway", "cascade",
    "conduit-ui", "conduit-mcp", "duality-ui", "file-system-server",
    "image-server", "mongodb", "nebula-srv", "nebula-mcp", "nebula-ui",
    "nexus-console", "ollama", "operator-svc", "peb-kernel", "plurality-ui",
    "redis", "role-memory-srv", "service-registry", "tackle-ui", "terrain",
    "ui-event-bus", "vision-srv", "vision-srv-3104", "vision-srv-py",
    "wrp-bridge-daemon",
}

# Patterns for structured IDs
UUID_PATTERN = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)
PLAN_ID_PATTERN = re.compile(r"\bplan[\s-]*(\d+)\b", re.IGNORECASE)
WR_ID_PATTERN = re.compile(r"\b(?:wr|work[\s-]*request)[\s-]*(\d+)\b", re.IGNORECASE)
REQ_ID_PATTERN = re.compile(r"\b(?:req|requirement)[\s-]*(\d+)\b", re.IGNORECASE)
PORT_PATTERN = re.compile(r"\bport[\s:]*(\d{4,5})\b", re.IGNORECASE)


def _extract_regex_entities(text: str) -> Set[str]:
    """Extract entities from text using regex patterns."""
    entities = set()

    # Known service names
    text_lower = text.lower()
    for svc in KNOWN_SERVICES:
        if svc in text_lower:
            entities.add(svc)

    # Structured IDs
    for match in UUID_PATTERN.finditer(text):
        entities.add(match.group().lower())
    for match in PLAN_ID_PATTERN.finditer(text):
        entities.add(f"plan-{match.group(1)}")
    for match in WR_ID_PATTERN.finditer(text):
        entities.add(f"wr-{match.group(1)}")
    for match in REQ_ID_PATTERN.finditer(text):
        entities.add(f"req-{match.group(1)}")
    for match in PORT_PATTERN.finditer(text):
        entities.add(f"port-{match.group(1)}")

    return entities


# ── Combined Compaction + Entity Extraction ───────────────────────
# Single LLM call produces both summary and structured metadata.

COMPACTION_NER_PROMPT = """Analyze this conversation exchange. Produce ONLY valid JSON with this structure:
{{"summary": "2-3 sentence summary", "topics": ["topic1"], "entities": ["entity1", "entity2"]}}

summary: Factual summary of what was asked, what data was retrieved, and what was answered.
topics: 1-3 high-level topics (infrastructure, pipeline, requirements, architecture, agent, general).
entities: Specific names mentioned — services, plans, work requests, requirements, ports, UUIDs.
- Be specific: "NATS" not "messaging", "plan-12" not "plan"
- Include port numbers as "port-XXXX"
- Do NOT include generic words unless they are proper names

User: {user_message}

Operator: {model_response}"""


def _compact_and_extract(user_message: str, model_response: str) -> Dict[str, Any]:
    """Compact the exchange and extract entities/topics.

    For short exchanges (< SHORT_EXCHANGE_THRESHOLD chars), uses regex-only
    extraction to avoid the LLM call latency. For longer exchanges, uses a
    single combined LLM call for both summary and entity extraction.
    """
    combined = user_message + " " + model_response

    # Fast path: short exchanges — regex-only, no LLM call
    if len(combined) < SHORT_EXCHANGE_THRESHOLD:
        regex_entities = _extract_regex_entities(combined)
        return {
            "summary": user_message[:200],
            "topics": [_detect_topic(user_message)],
            "entities": list(regex_entities),
        }

    # Full path: longer exchanges — single combined LLM call
    regex_entities = _extract_regex_entities(combined)
    prompt = COMPACTION_NER_PROMPT.format(
        user_message=user_message[:2000],
        model_response=model_response[:2000],
    )
    try:
        result = call_llm(
            prompt=prompt,
            role="operator",
            system_prompt="You are a summarization and entity extraction assistant. Output only valid JSON.",
            fallback=True,
        )
        result = (result or "").strip()
        if result.startswith("```"):
            result = re.sub(r"^```(?:json)?\s*", "", result)
            result = re.sub(r"\s*```$", "", result)
        parsed = json.loads(result)
        summary = (parsed.get("summary") or "").strip()
        topics = parsed.get("topics") or parsed.get("topic") or []
        entities = parsed.get("entities") or parsed.get("entity") or []
        if isinstance(topics, str):
            topics = [topics]
        if isinstance(entities, str):
            entities = [entities]
    except (json.JSONDecodeError, Exception) as e:
        _log.warning("Combined compaction+NER failed: %s", e)
        summary = user_message[:200]
        topics = []
        entities = []

    # Merge regex entities
    all_entities = list(entities) + list(regex_entities)
    seen = set()
    deduped = []
    for e in all_entities:
        e_lower = e.lower().strip()
        if e_lower and e_lower not in seen:
            seen.add(e_lower)
            deduped.append(e_lower)

    if not topics:
        topics = [_detect_topic(user_message)]

    return {
        "summary": summary or user_message[:200],
        "topics": topics,
        "entities": deduped,
    }


# ── Topic Detection (keyword fallback) ────────────────────────────

TOPIC_KEYWORDS = {
    "infrastructure": ["service", "server", "health", "status", "running", "terrain", "deploy", "port"],
    "pipeline": ["plan", "pipeline", "conduit", "work request", "ticket", "session", "circuit"],
    "requirements": ["requirement", "need", "must", "should", "backlog", "rms", "priority"],
    "architecture": ["design", "architecture", "decision", "trade", "pattern", "component"],
    "agent": ["agent", "record", "harvest", "report", "analysis", "nebula"],
}


def _detect_topic(user_message: str) -> str:
    """Detect topic via keyword matching (fallback for when LLM extraction fails)."""
    msg_lower = user_message.lower()
    scores = {}
    for topic, keywords in TOPIC_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in msg_lower)
        if score > 0:
            scores[topic] = score
    if scores:
        return max(scores, key=scores.get)
    return "general"


# ── Index Operations ──────────────────────────────────────────────

def _push_to_entity_index(session_id: str, item: Dict[str, Any]) -> None:
    """Add item to entity index (entity → [items])."""
    entity_index = _get_entity_index(session_id)
    for entity in item.get("entities", []):
        if entity not in entity_index:
            entity_index[entity] = []
        entity_index[entity].append(item)
    # Trim if too large
    total = sum(len(v) for v in entity_index.values())
    if total > ENTITY_INDEX_MAX:
        # Remove oldest entity with fewest items
        smallest = min(entity_index, key=lambda k: len(entity_index[k]))
        if entity_index[smallest]:
            entity_index[smallest].pop(0)
            if not entity_index[smallest]:
                del entity_index[smallest]


def _push_to_topic_map(session_id: str, item: Dict[str, Any]) -> None:
    """Add item to topic map (topic → [items])."""
    topic_map = _get_topic_map(session_id)
    for topic in item.get("topics", ["general"]):
        if topic not in topic_map:
            topic_map[topic] = []
        topic_map[topic].append(item)
    # Trim
    total = sum(len(v) for v in topic_map.values())
    if total > ENTITY_INDEX_MAX:
        smallest = min(topic_map, key=lambda k: len(topic_map[k]))
        if topic_map[smallest]:
            topic_map[smallest].pop(0)


def _find_relevant_context(session_id: str, user_message: str) -> List[Dict[str, Any]]:
    """Find relevant items using entity matching + topic matching."""
    # Extract entities from the user's message
    user_entities = _extract_regex_entities(user_message)
    entity_index = _get_entity_index(session_id)
    topic_map = _get_topic_map(session_id)

    matched_items: Dict[str, Dict[str, Any]] = {}  # summary → item (dedup)

    # Entity matching (highest relevance)
    for entity in user_entities:
        for item in entity_index.get(entity, []):
            key = item.get("summary", "")
            if key not in matched_items:
                matched_items[key] = item

    # Topic matching (secondary)
    topic = _detect_topic(user_message)
    for item in topic_map.get(topic, []):
        key = item.get("summary", "")
        if key not in matched_items:
            matched_items[key] = item

    # Return up to 5 most recent items
    items = list(matched_items.values())
    items.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return items[:5]


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


def _push_to_queue(session_id: str, user_message: str, model_response: str) -> None:
    """Compact, extract entities, and push to the continuity queue."""
    # Single LLM call: compaction + entity extraction
    extracted = _compact_and_extract(user_message, model_response)
    summary = extracted["summary"]
    if not summary:
        return

    item = {
        "summary": summary,
        "user_message": user_message[:500],
        "topics": extracted["topics"],
        "entities": extracted["entities"],
        "timestamp": time.time(),
    }

    q = _get_session_queue(session_id)
    with _get_session_lock(session_id):
        # If queue is full, push oldest to indexes
        if len(q) >= CONTINUITY_QUEUE_MAX:
            oldest = q[0]
            _push_to_entity_index(session_id, oldest)
            _push_to_topic_map(session_id, oldest)
        q.append(item)

    # Persist to DB in background
    threading.Thread(
        target=save_queue,
        args=(session_id, list(q)),
        daemon=True,
    ).start()

    _log.info(
        "Session %s queue: %d items, topics: %s, entities: %s",
        session_id, len(q),
        extracted["topics"],
        extracted["entities"][:5],
    )


# ── Prompt Building ───────────────────────────────────────────────

def build_prompt(user_message: str, session_id: str) -> str:
    """Build the prompt string for the LLM call.

    Uses the continuity queue for recent context and the entity+topic
    index for relevant long-term context.
    """
    parts = []

    # Add compacted history from continuity queue
    q = _get_session_queue(session_id)
    if q:
        parts.append("Previous conversation context:")
        for i, item in enumerate(q):
            parts.append(f"[{i+1}] {item['summary']}")
        parts.append("")

    # Add relevant context from entity+topic index
    relevant = _find_relevant_context(session_id, user_message)
    if relevant:
        parts.append("Earlier related discussion:")
        for item in relevant:
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

    # Build prompt from continuity queue + entity/topic index
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
