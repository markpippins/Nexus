#!/usr/bin/env python3
"""operator.chat_store — Prompts/responses table access.

Logs every chat exchange to the operator.prompts_responses table
and retrieves session history for context window management.
"""

import json
import logging
import os
import urllib.request
from typing import Any, Dict, List, Optional

_log = logging.getLogger("operator.chat_store")

PG_DSN = os.environ.get(
    "OPERATOR_PG_DSN",
    "postgresql://pguser:pgpass@localhost:5432/nexus",
)

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]


def _psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    """Run a SQL statement via docker psql."""
    import subprocess
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"
    except Exception as e:
        return 1, str(e)


def log_prompt_response(
    session_id: str,
    user_message: str,
    model_response: str,
    role: str = "operator",
    model_identifier: str = "",
    tokens_in: int = 0,
    tokens_out: int = 0,
    latency_ms: int = 0,
    metadata: Optional[Dict[str, Any]] = None,
) -> bool:
    """Log a prompt/response exchange to the database."""
    meta_json = json.dumps(metadata or {}).replace("'", "''")
    user_msg_escaped = user_message.replace("'", "''")
    model_resp_escaped = (model_response or "").replace("'", "''")
    model_id_escaped = model_identifier.replace("'", "''")
    role_escaped = role.replace("'", "''")

    sql = f"""
    INSERT INTO operator.prompts_responses
        (session_id, role, user_message, model_response, model_identifier,
         tokens_in, tokens_out, latency_ms, metadata)
    VALUES
        ('{session_id}', '{role_escaped}', '{user_msg_escaped}', '{model_resp_escaped}',
         '{model_id_escaped}', {tokens_in}, {tokens_out}, {latency_ms}, '{meta_json}'::jsonb);
    """

    rc, out = _psql(sql, timeout=10)
    if rc != 0:
        _log.error("Failed to log prompt/response: %s", out)
        return False
    return True


def get_session_history(session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve conversation history for a session."""
    sql = f"""
    SELECT role, user_message, model_response, model_identifier, created_at
    FROM operator.prompts_responses
    WHERE session_id = '{session_id}'
    ORDER BY created_at ASC
    LIMIT {limit};
    """

    rc, out = _psql(sql, timeout=10)
    if rc != 0 or not out:
        return []

    messages = []
    for line in out.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 5:
            messages.append({
                "role": parts[0],
                "user_message": parts[1],
                "model_response": parts[2],
                "model_identifier": parts[3],
                "created_at": parts[4],
            })
    return messages


def save_queue(session_id: str, items: List[Dict[str, Any]]) -> bool:
    """Persist the continuity queue to the database."""
    # Clear existing queue for this session
    sql = f"SELECT operator.clear_queue('{session_id}');"
    rc, out = _psql(sql, timeout=10)
    if rc != 0:
        _log.error("Failed to clear queue: %s", out)
        return False

    # Insert each item
    for i, item in enumerate(items):
        summary = item.get("summary", "").replace("'", "''")
        user_msg = item.get("user_message", "").replace("'", "''")
        topic = item.get("topic", "").replace("'", "''")
        sql = f"SELECT operator.save_queue_item('{session_id}', '{summary}', '{user_msg}', '{topic}', {i});"
        rc, out = _psql(sql, timeout=10)
        if rc != 0:
            _log.error("Failed to save queue item %d: %s", i, out)
            return False

    return True


def load_queue(session_id: str) -> List[Dict[str, Any]]:
    """Load the continuity queue from the database."""
    sql = f"SELECT * FROM operator.load_queue('{session_id}');"
    rc, out = _psql(sql, timeout=10)
    if rc != 0 or not out:
        return []

    items = []
    for line in out.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 3:
            items.append({
                "summary": parts[0],
                "user_message": parts[1],
                "topic": parts[2] if len(parts) > 2 else "",
                "timestamp": 0,  # DB doesn't store timestamp, use 0
            })
    return items


def get_recent_sessions(limit: int = 20) -> List[Dict[str, Any]]:
    """List recent sessions with message counts."""
    sql = f"""
    SELECT session_id,
           count(*)::int as message_count,
           min(created_at)::text as first_message,
           max(created_at)::text as last_message
    FROM operator.prompts_responses
    GROUP BY session_id
    ORDER BY max(created_at) DESC
    LIMIT {limit};
    """

    rc, out = _psql(sql, timeout=10)
    if rc != 0 or not out:
        return []

    sessions = []
    for line in out.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) >= 4:
            sessions.append({
                "session_id": parts[0],
                "message_count": int(parts[1]) if parts[1] else 0,
                "first_message": parts[2],
                "last_message": parts[3],
            })
    return sessions
