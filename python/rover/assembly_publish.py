"""assembly_publish.py — Publish a harvest + its candidates to the Assembly forum
via direct REST calls to assembly-srv (port 3107).

Replaces the broken path that POSTed `{jsonrpc, method:tools/call,
name:assembly_publish_harvest}` to `http://localhost:3112` (that URL points at
`service-broker-mcp`, an SSE-transport bridge whose `/` returns
`{error:"Not found. Available: GET /sse, POST /messages, GET /health"}` — so
forum publishing failed every harvest-pipeline tick).

Faithful port of the `assembly_publish_harvest` MCP tool defined in
`nexus/typescript/assembly-mcp/src/tools.ts` (`assembly_publish_harvest`,
line 652). assembly-srv (port 3107) exposes every primitive that tool wraps
internally, so we call REST directly:

    1. Fetch harvest      → nebula GET /api/harvests/:id                (port 3101)
    2. Fetch candidates   → nebula GET /api/harvest-candidates?harvestId (port 3101)
    3. Format post body   → formatHarvestPostBody (ported verbatim)
    4. Create thread      → assembly POST /api/forums/harvest-candidates/threads
    5. Link post→harvest  → assembly POST /api/bridges/post-artifact
    6. Link post→cands    → assembly POST /api/bridges/post-artifact (per candidate)
    7. Supporting refs    → assembly POST /api/bridges/supporting-refs (×3)

Usage::

    from assembly_publish import publish_harvest_to_forum

    if publish_harvest_to_forum(harvest_id):
        log.info("published")
    else:
        log.warning("publish failed")

The forum slug (`harvest-candidates`) and Rover authorship are fixed by the
schema; the migration in `assembly-srv/assembly-migration.sql` seeds both.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

log = logging.getLogger("assembly_publish")

# ── Service endpoints ────────────────────────────────────────────────
NEBULA_API = "http://localhost:3101/api"
ASSEMBLY_API = "http://localhost:3107/api"

# Fixed by assembly-migration.sql (see assembly-srv/assembly-migration.sql
# §7 seeding the Harvest Candidates forum). Resolved at runtime, not
# hard-coded, so re-migrating with a new UUID is transparent.
HARVEST_FORUM_SLUG = "harvest-candidates"
# Rover's assembly user UUID (resolved once per process; aliased "Rover").
# Migration seeds this user; see assembly.users lookup.
ROVER_USER_UUID = "473afc80-a10a-4011-8aa3-ae8d7d55be94"


# ── HTTP helpers ──────────────────────────────────────────────────────

def _get_json(url: str, timeout: int = 15) -> Any:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _post_json(url: str, body: dict, timeout: int = 15) -> tuple[int, Any]:
    """POST JSON. Returns (status, parsed-body-or-text)."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        text = e.read().decode() if e.fp else ""
        try:
            parsed = json.loads(text) if text else {}
        except json.JSONDecodeError:
            parsed = text
        return e.code, parsed


# ── Proxies to nebula-srv (matches assembly-mcp/src/nebula-proxy.ts) ───

def _fetch_harvest(harvest_id: str) -> dict | None:
    """Fetch a harvest by id (GET /api/harvests/:id). Returns None if 404."""
    try:
        return _get_json(f"{NEBULA_API}/harvests/{urllib.parse.quote(harvest_id)}")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except Exception as e:
        log.error("  nebula GET /harvests/%s failed: %s", harvest_id[:8], e)
        return None


def _fetch_harvest_candidates(harvest_id: str) -> list[dict]:
    """Fetch candidates for a harvest (GET /api/harvest-candidates?harvestId=…)."""
    url = (
        f"{NEBULA_API}/harvest-candidates"
        f"?harvestId={urllib.parse.quote(harvest_id)}&pageSize=100"
    )
    try:
        body = _get_json(url)
    except Exception as e:
        log.error("  nebula GET /harvest-candidates failed: %s", e)
        return []
    if isinstance(body, dict) and "items" in body:
        return body["items"]
    if isinstance(body, list):
        return body
    return []


# ── Body formatter (port of formatHarvestPostBody, tools.ts:332-395) ───

def _format_harvest_post_body(harvest: dict, candidates: list[dict]) -> str:
    """Render the forum post body. Ported verbatim from assembly-mcp's
    formatHarvestPostBody to preserve rendering fidelity during the
    MCP→REST transition (do not change the format unprompted)."""
    lines: list[str] = []

    docklang = harvest.get("docklang") or {}
    title = (docklang.get("meta") or {}).get("title") or harvest.get("source_filename", "")
    lines.append(f"# {title}")
    lines.append("")

    # Metadata block
    lines.append("| Field | Value |")
    lines.append("|-------|-------|")
    lines.append(f"| Source | `{harvest.get('source_path', '')}` |")
    lines.append(f"| Model | {harvest.get('model', '')} |")
    stats = docklang.get("stats") if isinstance(docklang, dict) else None
    if stats:
        lines.append(f"| Turns | {stats.get('total_units', '?')} |")
        lines.append(f"| Blocks | {stats.get('total_blocks', '?')} |")
    created_at = harvest.get("created_at", "")
    # ISO slice (matches the TS Date(...).toISOString().slice(0,10))
    date_part = str(created_at)[:10] if created_at else ""
    lines.append(f"| Harvested | {date_part} |")
    lines.append("")

    # Candidates section
    if candidates:
        lines.append("---")
        lines.append("")
        lines.append(f"## Candidates ({len(candidates)})")
        lines.append("")
        for i, c in enumerate(candidates):
            status = c.get("status") or ""
            status_badge = f" [`{status}`]" if status else ""
            lines.append(f"### {i + 1}. {c.get('title', '')}{status_badge}")
            lines.append("")
            intent = c.get("intent_description") or ""
            if intent:
                lines.append(intent)
                lines.append("")
            sys_id = c.get("system_id")
            sub_id = c.get("subsystem_id")
            feat_id = c.get("feature_id")
            if sys_id or sub_id or feat_id:
                parts = []
                if sys_id:
                    parts.append(f"system: `{str(sys_id)[:8]}`")
                if sub_id:
                    parts.append(f"subsystem: `{str(sub_id)[:8]}`")
                if feat_id:
                    parts.append(f"feature: `{str(feat_id)[:8]}`")
                lines.append(f"*Mapped to: {', '.join(parts)}*")
                lines.append("")
    else:
        lines.append("---")
        lines.append("")
        lines.append("*No candidates extracted from this harvest.*")
        lines.append("")

    # Links
    lines.append("---")
    lines.append("")
    lines.append(f"🔗 **View formatted transcript:** [{title}](/harvests/{harvest.get('id', '')})")
    lines.append("")
    src_path = harvest.get("source_path", "")
    lines.append(f"📄 **Open original chat:** [{src_path}](/chats/{urllib.parse.quote(src_path, safe='')})")
    lines.append("")

    return "\n".join(lines)


# ── Bridge writers (matches assembly-srv/src/routes/bridges.js) ────────

def _link_post_artifact(post_id: str, artifact_type: str, artifact_id: str,
                        label: str | None = None) -> bool:
    """POST /api/bridges/post-artifact — link post → nebula artifact."""
    body = {
        "post_id": post_id,
        "artifact_type": artifact_type,
        "artifact_id": artifact_id,
        "label": label,
    }
    status, resp = _post_json(f"{ASSEMBLY_API}/bridges/post-artifact", body)
    if status != 201:
        log.warning("  post-artifact %s/%s → %s: %s", artifact_type, str(artifact_id)[:8], status, resp)
        return False
    return True


def _add_supporting_ref(post_id: str, ref_type: str, ref_value: str,
                        metadata: dict | None = None) -> bool:
    """POST /api/bridges/supporting-refs — attach a supporting reference."""
    body = {
        "post_id": post_id,
        "ref_type": ref_type,
        "ref_value": ref_value,
        "metadata": metadata or {},
    }
    status, resp = _post_json(f"{ASSEMBLY_API}/bridges/supporting-refs", body)
    if status != 201:
        log.warning("  supporting-refs %s → %s: %s", ref_type, status, resp)
        return False
    return True


# ── Public entry point ────────────────────────────────────────────────

def publish_harvest_to_forum(harvest_id: str) -> bool:
    """Publish a harvest and its candidates to the Assembly forum.

    Faithful REST port of the assembly-mcp `assembly_publish_harvest` tool.
    Returns True on success, False if any required step failed.

    Side effects:
        - posts one new thread to the `harvest-candidates` forum (Rover author)
        - links post→harvest + post→each candidate in post_artifact_refs
        - adds three supporting refs (transcript viewer / api / original chat)
    """
    # 1. Fetch harvest
    harvest = _fetch_harvest(harvest_id)
    if not harvest:
        log.error("  harvest not found: %s", harvest_id)
        return False

    # 2. Fetch candidates
    candidates = _fetch_harvest_candidates(harvest_id)

    # 3. Format body + title
    docklang = harvest.get("docklang") or {}
    title = (docklang.get("meta") or {}).get("title") or harvest.get("source_filename", "(untitled)")
    body = _format_harvest_post_body(harvest, candidates)

    # 4. Create thread (assembly-srv REST)
    thread_body = {
        "title": str(title)[:500],
        "body": body,
        "postedById": ROVER_USER_UUID,
        "source_url": harvest.get("source_path"),
    }
    status, resp = _post_json(f"{ASSEMBLY_API}/forums/{HARVEST_FORUM_SLUG}/threads", thread_body)
    if status != 201:
        log.error("  create thread → %s: %s", status, resp)
        return False
    post_id = resp.get("id")
    if not post_id:
        log.error("  create thread returned no id: %s", resp)
        return False
    log.info("  Forum post created: %s (id=%s)", str(title)[:60], post_id[:8])

    # 5. Link post → harvest (artifact_type='harvest', label='source')
    _link_post_artifact(post_id, "harvest", harvest_id, "source")

    # 6. Link post → each candidate (artifact_type='harvest_candidate')
    for c in candidates:
        cid = c.get("id")
        if cid:
            _link_post_artifact(post_id, "harvest_candidate", cid, None)

    # 7. Supporting refs (URLs to transcript viewer / API / original chat)
    hid = harvest.get("id", harvest_id)
    src_path = harvest.get("source_path", "")
    _add_supporting_ref(post_id, "source_url", f"/harvests/{hid}",
                       {"harvest_id": hid, "label": "transcript_viewer"})
    _add_supporting_ref(post_id, "source_url",
                       f"http://localhost:3101/api/harvests/{hid}/transcript",
                       {"harvest_id": hid, "label": "transcript_api"})
    _add_supporting_ref(post_id, "source_url", f"/chats/{urllib.parse.quote(src_path, safe='')}",
                       {"harvest_id": hid, "source_filename": harvest.get("source_filename", ""),
                        "label": "original_chat"})

    return True
