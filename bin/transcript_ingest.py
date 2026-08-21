#!/usr/bin/env python3
"""
Transcript ingest orchestrator — the unified atomic pipeline.

Parse → rule-based segment → store docklang in PG → create snapshot +
blocks → create segment set → post to Assembly forum.

Strict atomic per transcript: if any step fails, all partial writes are
cleaned up (harvest deleted, forum thread deleted) so nothing half-published
survives. Idempotent: content-hash skip; changed content → update in place.

Usage:
  python3 transcript_ingest.py /path/to/conversation.html
  python3 transcript_ingest.py /path/to/exports/ --limit 5
  python3 transcript_ingest.py /path/to/file --dry-run
  python3 transcript_ingest.py /path/to/file --no-forum     # skip forum posting
  python3 transcript_ingest.py /path/to/file --no-substance # skip segment-set creation

Env:
  NEBULA_API (default http://localhost:3101) — harvest insert
  ASSEMBLY_API (default http://localhost:3107) — forum posting
  SUBSTANCE_API (default http://localhost:3115) — segment sets
  PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE — direct PG for blocks/snapshots
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "python"))

from format_detector import detect
from deepseek_parser import parse_export as parse_deepseek_dir
from gemini_parser import parse_gemini_html
from chatgpt_json_parser import parse_chatgpt_json
from chatgpt_md_parser import parse_chatgpt_markdown
from claude_parser import parse_claude_html
from discourse_segmenter import segment as segment_transcript, pool_turns
from mongo_to_pg_docklang import build_discourse_units

# ── Config ────────────────────────────────────────────────────────────

NEBULA_API = os.environ.get("NEBULA_API", "http://localhost:3101")
ASSEMBLY_API = os.environ.get("ASSEMBLY_API", "http://localhost:3107")
SUBSTANCE_API = os.environ.get("SUBSTANCE_API", "http://localhost:3115")

FORUM_SLUG = "transcripts"
FORUM_USERS = {
    "deepseek": "301188fc-8f68-4c4d-8064-31b0cefbeff9",
    "gemini": "c7fb03d1-d5e9-4fa3-aaa0-d659decf6953",
    "chatgpt": "c7d28da1-80a2-4079-b478-33cac2747d0c",
    "claude_html": "6a818082-07a4-4d20-baf1-c6151289d2d0",
}

# ── HTTP helpers ─────────────────────────────────────────────────────


def _post_json(url: str, payload: dict, timeout: int = 30) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _delete_url(url: str, timeout: int = 15) -> bool:
    req = urllib.request.Request(url, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status < 300
    except Exception:
        return False


def _get_json(url: str, timeout: int = 15) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


# ── PG helpers (for snapshot + blocks) ───────────────────────────────

import subprocess

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]


def _psql(sql: str, timeout: int = 60) -> tuple[int, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A", "-v", "ON_ERROR_STOP=1"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, (result.stdout + result.stderr).strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


# ── Parse ────────────────────────────────────────────────────────────


def parse_file(fpath: str, fmt: str) -> list[dict]:
    """Parse a single file — delegates to the format-specific parser."""
    if fmt == "deepseek_json":
        parent = os.path.dirname(fpath)
        transcripts = parse_deepseek_dir(parent)
        basename = os.path.basename(fpath)
        return [t for t in transcripts if t.get("file_metadata", {}).get("source_file") == basename]
    elif fmt == "gemini3_html":
        t = parse_gemini_html(fpath)
        return [t] if t else []
    elif fmt == "chatgpt_json":
        t = parse_chatgpt_json(fpath)
        return [t] if t else []
    elif fmt == "chatgpt_markdown":
        t = parse_chatgpt_markdown(fpath)
        return [t] if t else []
    elif fmt == "claude_html":
        t = parse_claude_html(fpath)
        return [t] if t else []
    return []


# ── Filename timestamp extraction ────────────────────────────────────

_TS_PATTERNS = [
    # 2026-08-21_13-34-20 or 2026-08-21-13-34-20
    re.compile(r"(\d{4})-(\d{2})-(\d{2})[ _-](\d{2})[ _-](\d{2})[ _-](\d{2})"),
    # 20260821_133420
    re.compile(r"(\d{4})(\d{2})(\d{2})[ _-](\d{2})(\d{2})(\d{2})"),
    # 2026-08-21 (date only)
    re.compile(r"(\d{4})-(\d{2})-(\d{2})"),
]


def extract_timestamp(filename: str) -> str | None:
    """Extract a timestamp from a filename. Returns ISO 8601 or None."""
    name = os.path.basename(filename)
    for pat in _TS_PATTERNS:
        m = pat.search(name)
        if m:
            parts = m.groups()
            if len(parts) == 3:
                y, mo, d = parts
                return f"{y}-{mo}-{d}T00:00:00Z"
            y, mo, d, h, mi, s = parts
            return f"{y}-{mo}-{dT}T{h}:{mi}:{s}Z"
    return None


def strip_timestamp_from_title(title: str, filename: str) -> str:
    """Remove the filename timestamp from titles/names."""
    ts = extract_timestamp(filename)
    if ts:
        # strip both ISO and the raw pattern from the title
        title = title.replace(ts, "").strip()
        for pat in _TS_PATTERNS:
            title = pat.sub("", title).strip()
    return title.strip(" -_") or "Untitled"


# ── Content hash ─────────────────────────────────────────────────────


def content_hash(transcript: dict) -> str:
    turns = transcript.get("turns", [])
    return hashlib.md5(
        json.dumps({"turns": turns}, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


# ── Idempotency: check existing harvest ──────────────────────────────


def find_existing_harvest(source_filename: str) -> dict | None:
    """Check if a harvest already exists for this source file.
    Returns {id, content_hash} or None."""
    try:
        data = _get_json(f"{NEBULA_API}/api/harvests")
        harvests = data.get("harvests", data) if isinstance(data, dict) else data
        if not isinstance(harvests, list):
            return None
        for h in harvests:
            if h.get("source_filename") == source_filename:
                # content_hash is stored in docklang JSONB or metadata
                ch = (h.get("docklang") or {}).get("content_hash") if isinstance(h.get("docklang"), dict) else None
                ch = ch or (h.get("metadata") or {}).get("content_hash")
                return {"id": h.get("id"), "content_hash": ch}
        return None
    except Exception:
        return None


def delete_harvest_and_segments(harvest_id: str) -> None:
    """Delete a harvest + its segment set + forum thread (for re-ingest)."""
    # Delete segment set (by metadata.harvest_id lookup via substance)
    try:
        # Find segment sets with this harvest_id in metadata
        sets = _get_json(f"{SUBSTANCE_API}/segment-sets")
        for s in (sets if isinstance(sets, list) else sets.get("items", [])):
            meta = s.get("metadata", {}) or {}
            if meta.get("harvest_id") == harvest_id:
                _delete_url(f"{SUBSTANCE_API}/segment-sets/{s['id']}")
    except Exception:
        pass
    # Delete harvest (cascades to snapshots, blocks, segments_history)
    _delete_url(f"{NEBULA_API}/api/harvests/{harvest_id}")


# ── Core: ingest one transcript ──────────────────────────────────────


def ingest_transcript(
    fpath: str,
    fmt: str,
    transcript: dict,
    *,
    dry_run: bool = False,
    no_forum: bool = False,
    no_substance: bool = False,
) -> dict:
    """
    Ingest a single transcript atomically.

    Returns a dict with: action (inserted|updated|unchanged|error), harvest_id,
    segment_set_id, thread_id, segments count.
    """
    turns = transcript.get("turns") or []
    if not turns:
        return {"action": "error", "error": "no turns"}

    ch = content_hash(transcript)
    title = strip_timestamp_from_title(
        transcript.get("title", "Untitled"), fpath
    )
    fmt_key = transcript.get("source_format", fmt)
    model = transcript.get("model", "unknown")
    post_date = extract_timestamp(fpath)
    source_file = (
        (transcript.get("file_metadata") or {}).get("source_file")
        or os.path.basename(fpath)
    )

    # 1) Segment
    segs = segment_transcript(transcript)
    pooled = pool_turns(transcript, segs)
    units = build_discourse_units(turns)  # arc-based discourse_units
    docklang = {"discourse_units": units, "content_hash": ch, "segments": segs}

    result = {
        "action": "inserted",
        "title": title,
        "turn_count": len(turns),
        "segment_count": len(segs),
        "pooled_turn_count": len(pooled),
        "content_hash": ch,
        "post_date": post_date,
    }

    if dry_run:
        result["action"] = "dry_run"
        return result

    # Idempotency: check if this source file is already ingested
    existing = find_existing_harvest(source_file)
    if existing:
        if existing.get("content_hash") == ch:
            result["action"] = "unchanged"
            result["harvest_id"] = existing["id"]
            return result
        # Content changed → delete old harvest + segments, then re-ingest
        delete_harvest_and_segments(existing["id"])
        result["action"] = "updated"

    # State for rollback
    harvest_id = None
    thread_id = None

    try:
        # 2) Insert harvest into PG (via nebula-srv API)
        harvest_resp = _post_json(f"{NEBULA_API}/api/harvests", {
            "sourcePath": fpath,
            "sourceFilename": source_file,
            "model": model or "unknown",
            "totalCandidates": 0,
            "candidates": [],
            "sourceText": "",
            "tags": ["transcript", "ingest"],
            "metadata": {"ingest": "transcript_ingest", "content_hash": ch},
            "docklang": docklang,
        })
        if harvest_resp.get("error"):
            raise RuntimeError(f"harvest insert error: {harvest_resp['error']}")
        harvest_id = harvest_resp.get("id")
        if not harvest_id:
            raise RuntimeError("harvest insert returned no id")
        result["harvest_id"] = harvest_id

        # 3) Create snapshot + blocks (direct SQL — like mongo_to_pg_docklang)
        snapshot_id, block_ids = _create_snapshot_and_blocks(
            harvest_id, turns, source_file
        )
        result["snapshot_id"] = snapshot_id

        # 4) Create segment set (via substance API)
        if not no_substance:
            seg_payload = _build_segment_payload(segs, block_ids, harvest_id, snapshot_id)
            segset_resp = _post_json(
                f"{SUBSTANCE_API}/segment-sets/from-segments",
                {
                    "name": title,
                    "description": f"Transcript: {title} ({len(turns)} turns, {len(segs)} segments)",
                    "metadata": {
                        "harvest_id": harvest_id,
                        "source_file": source_file,
                        "content_hash": ch,
                        "kind": "TRANSCRIPT",
                    },
                    "conversation_id": harvest_id,
                    "snapshot_id": snapshot_id,
                    "segments": seg_payload,
                },
            )
            result["segment_set_id"] = segset_resp.get("id")

        # 5) Post to Assembly forum
        if not no_forum:
            user_id = FORUM_USERS.get(fmt_key)
            if user_id:
                thread_id = _post_forum_thread(
                    title, transcript, segs, result.get("segment_set_id"),
                    fmt_key, model, post_date, user_id,
                )
                result["thread_id"] = thread_id
                # Post pooled turns as comments
                for turn in pooled:
                    _post_forum_comment(thread_id, turn, user_id, fmt_key, model)
                    time.sleep(0.1)

        return result

    except Exception as e:
        # Rollback: clean up partial writes
        result["action"] = "error"
        result["error"] = str(e)
        if thread_id:
            _delete_url(f"{ASSEMBLY_API}/api/forums/threads/{thread_id}")
        if harvest_id:
            _delete_url(f"{NEBULA_API}/api/harvests/{harvest_id}")
        return result


def _create_snapshot_and_blocks(
    harvest_id: str, turns: list[dict], source_file: str
) -> tuple[str, list[str]]:
    """Create a conversation_snapshot + conversation_blocks via SQL.
    Returns (snapshot_id, [block_id, ...])."""
    import uuid as uuid_mod

    snapshot_id = str(uuid_mod.uuid4())
    block_ids: list[str] = []

    # Build snapshot INSERT
    source_hash = hashlib.md5(
        json.dumps([t.get("content", "") for t in turns], ensure_ascii=False).encode()
    ).hexdigest()
    block_count = len(turns)

    parts = [f"""
    INSERT INTO nebula.conversation_snapshots
        (id, conversation_id, snapshot_index, source_hash, capture_mode,
         block_count, created_by, created_at)
    VALUES ('{snapshot_id}'::uuid, '{harvest_id}'::uuid, 0, '{source_hash}',
            'transcript_ingest', {block_count}, 'SYSTEM', now());
    """]

    # Build block INSERTs (1 block per turn, block_index = turn index)
    rows = []
    for i, turn in enumerate(turns):
        role = turn.get("role", "unknown")
        content = turn.get("content", "")
        if isinstance(content, list):
            content = "\n".join(
                p.get("text", "") if isinstance(p, dict) else str(p) for p in content
            )
        content = str(content).replace("'", "''")
        bid = str(uuid_mod.uuid4())
        block_ids.append(bid)
        ch = hashlib.md5(content.encode()).hexdigest()
        rows.append(
            f"('{bid}'::uuid, '{harvest_id}'::uuid, '{snapshot_id}'::uuid, "
            f"{i}, 'paragraph', E'{content}', '{ch}', '{role}')"
        )
    if rows:
        values = ",\n".join(rows)
        parts.append(f"""
        INSERT INTO nebula.conversation_blocks
            (id, conversation_id, snapshot_id, block_index, block_type,
             content_md, content_hash, role)
        VALUES {values};
        """)

    sql = "BEGIN;\n" + "\n".join(parts) + "\nCOMMIT;"
    rc, out = _psql(sql)
    if rc != 0:
        raise RuntimeError(f"snapshot/blocks SQL failed: {out[:300]}")
    return snapshot_id, block_ids


def _build_segment_payload(
    segs: list[dict], block_ids: list[str],
    harvest_id: str, snapshot_id: str,
) -> list[dict]:
    """Build the segments payload for POST /segment-sets/from-segments."""
    payload = []
    for seg in segs:
        start_idx = seg["start_turn"]
        end_idx = seg["end_turn"]
        if start_idx >= len(block_ids) or end_idx >= len(block_ids):
            continue
        payload.append({
            "start_block_id": block_ids[start_idx],
            "end_block_id": block_ids[end_idx],
            "start_block_index": start_idx,
            "end_block_index": end_idx,
            "segment_type": "discussion",
            "title": seg.get("title"),
            "notes_md": f"boundary: {seg.get('boundary_reason', 'none')}",
        })
    return payload


# ── Forum posting ────────────────────────────────────────────────────


def _post_forum_thread(
    title: str, transcript: dict, segs: list[dict],
    segment_set_id: str | None, fmt: str, model: str | None,
    post_date: str | None, user_id: str,
) -> str | None:
    """Post a structured thread: metadata + segment-set ref + post date."""
    turns = transcript.get("turns", [])
    body = f"**Source:** {fmt}\n**Model:** {model or 'unknown'}\n"
    body += f"**Turns:** {len(turns)}\n**Segments:** {len(segs)}\n"
    if segment_set_id:
        body += f"**Substance Segment Set:** `{segment_set_id}`\n"
    if post_date:
        body += f"**Post Date:** {post_date}\n"
    body += f"**Ingested:** {datetime.now(timezone.utc).isoformat()}\n\n"
    body += "## Segments\n\n"
    for seg in segs:
        br = seg.get("boundary_reason") or "initial"
        body += f"- **[{seg['segment_index']}]** turns {seg['start_turn']}–{seg['end_turn']} ({seg['turn_count']}t) — *{br}* — {seg['title'][:100]}\n"

    resp = _post_json(f"{ASSEMBLY_API}/api/forums/{FORUM_SLUG}/threads", {
        "title": f"[{fmt}] {title} ({len(turns)} turns, {len(segs)} segments)"[:200],
        "body": body,
        "postedById": user_id,
        "role": "engineer",
        "model": os.environ.get("NEXUS_AGENT_MODEL", "z-ai/glm-5.2"),
    })
    return resp.get("id")


def _post_forum_comment(
    thread_id: str, turn: dict, user_id: str, fmt: str, model: str | None
):
    """Post one pooled turn as a comment, referencing its segment."""
    role = turn.get("role", "unknown")
    role_label = "User" if role == "user" else "Assistant"
    segs = turn.get("segment_indices", [])
    seg_ref = f" (segments: {', '.join(str(s) for s in segs)})" if segs else ""
    body = f"**{role_label}**{seg_ref}\n\n{turn.get('content', '')}"
    _post_json(
        f"{ASSEMBLY_API}/api/forums/threads/{thread_id}/comments",
        {
            "body": body,
            "postedById": user_id,
            "role": "engineer",
            "model": os.environ.get("NEXUS_AGENT_MODEL", "z-ai/glm-5.2"),
        },
    )


# ── Main ─────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description="Unified atomic transcript ingest")
    ap.add_argument("path", help="File or directory to ingest")
    ap.add_argument("--limit", type=int, default=0, help="Max files to process (0=all)")
    ap.add_argument("--dry-run", action="store_true", help="Parse + segment only, no writes")
    ap.add_argument("--no-forum", action="store_true", help="Skip forum posting")
    ap.add_argument("--no-substance", action="store_true", help="Skip segment-set creation")
    args = ap.parse_args()

    # Collect files
    if os.path.isfile(args.path):
        files = [args.path]
    elif os.path.isdir(args.path):
        files = []
        for root, _dirs, fnames in os.walk(args.path):
            for fname in sorted(fnames):
                fpath = os.path.join(root, fname)
                if os.path.getsize(fpath) > 1000 and not fname.endswith((".css", ".js", ".png", ".jpg")):
                    files.append(fpath)
        files.sort(key=lambda f: os.path.getsize(f), reverse=True)
    else:
        print(f"ERROR: {args.path} not found", file=sys.stderr)
        return 1

    if args.limit > 0:
        files = files[:args.limit]

    if not files:
        print("No files to process.")
        return 0

    results = {"ingested": 0, "errors": 0, "unchanged": 0}
    for fpath in files:
        try:
            fmt, _conf = detect(fpath, threshold=0.5)
        except Exception:
            continue
        if fmt == "unknown":
            continue
        parsed = parse_file(fpath, fmt)
        if not parsed:
            continue

        for t in parsed:
            r = ingest_transcript(
                fpath, fmt, t,
                dry_run=args.dry_run, no_forum=args.no_forum,
                no_substance=args.no_substance,
            )
            action = r["action"]
            if action == "dry_run":
                print(f"  [dry] {r['title'][:50]}: {r['turn_count']}t → {r['segment_count']} segs")
            elif action == "error":
                print(f"  [ERR] {r.get('title','?')[:50]}: {r.get('error','?')}")
                results["errors"] += 1
            else:
                print(f"  [{action}] {r.get('title','?')[:50]}: {r['turn_count']}t → {r['segment_count']} segs"
                      + (f" | thread={r.get('thread_id','')[:8]}" if r.get("thread_id") else ""))
                results[action] = results.get(action, 0) + 1
                if action == "inserted":
                    results["ingested"] += 1

    print(f"\nSummary: {results}")
    return 1 if results["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
