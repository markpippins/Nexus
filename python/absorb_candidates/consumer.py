#!/usr/bin/env python3
"""absorb-candidates — downstream candidate identification (LLM stage).

Consumes docklang documents produced by absorb profiles, chunks them by
discourse-arc segments, extracts Specification Candidates with a local LLM
(Ollama), and attaches them to the existing harvest rows via nebula-srv
POST /api/harvest-candidates.

Deliberately SEPARATE from the absorb core package: absorb is an
ingest/projection layer (ratified constraint — no LLM stages inside it).
This consumer reads absorb's state and writes only through the declared
nebula API. Consumption tracking lives in absorb.watermarks under
profile_id='candidate-chunking', so the stockpiled corpus flows through
without re-ingestion and new documents are picked up automatically.

Usage:
    python3 -m absorb_candidates consume --limit 2 [--dry-run]
        [--model qwen2.5-coder:latest] [--chunk-chars 40000]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))            # this pkg's parent
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "absorb"))  # absorb core pkg

from absorb.core import ASSEMBLY_API, NEBULA_API, pg_fetchall, pg_execute, utcnow_iso  # noqa: E402
from absorb.errors import AbsorbError                                                  # noqa: E402

CONSUMER_PROFILE = "candidate-chunking"
CONSUMER_VERSION = 1

# ── Extraction schema + prompt (ported from legacy rover prompt.md) ──

CANDIDATE_SCHEMA = {
    "type": "object",
    "properties": {
        "candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "status": {"type": "string",
                               "enum": ["Proposed", "Agreed", "Under Discussion", "Superseded"]},
                    "intent_description": {"type": "string"},
                    "requirements": {"type": "array", "items": {"type": "string"}},
                    "implementation_notes": {"type": "array", "items": {"type": "string"}},
                    "open_questions": {"type": "array", "items": {"type": "string"}},
                    "code_snippets": {
                        "type": "array",
                        "items": {"type": "object", "properties": {
                            "language": {"type": "string"},
                            "purpose": {"type": "string"},
                            "raw_code": {"type": "string"}}},
                    },
                },
                "required": ["title", "intent_description"],
            },
        }
    },
    "required": ["candidates"],
}

SYSTEM_PROMPT = """You are a Software Archaeologist and Technical Analyst.
Extract actionable engineering intent ("Specification Candidates") from this
chunk of a developer chat transcript. Rules:
1. Deduplicate intent: capture the final resolved state when a topic evolves.
2. Separate WHAT is wanted (intent) from HOW it will be built (implementation notes).
3. Extract code word-for-word into code_snippets; never truncate; note language.
4. Flag unresolved questions, disagreements, and follow-ups as open_questions.
5. Absolute precision: keep version numbers, stack choices, and constraints exact.
Return JSON matching the schema. If the chunk contains no actionable intent,
return {"candidates": []}."""


# ── HTTP helpers ─────────────────────────────────────────────────────

def _post_json(url: str, body: dict, timeout: int = 180) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        text = e.read().decode() if e.fp else ""
        cls = "E_PERMANENT" if e.code < 500 else "E_TRANSIENT"
        raise AbsorbError(f"{cls}_HTTP_{e.code}", f"{url} -> {e.code}: {text[:160]}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise AbsorbError("E_TRANSIENT_LLM_UNAVAILABLE" if "11434" in url else "E_TRANSIENT_NETWORK", str(e)[:160])


def ollama_chat(model: str, chunk_text: str) -> list[dict]:
    """Structured extraction via local Ollama. Returns validated candidate dicts."""
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"<transcript_chunk>\n{chunk_text}\n</transcript_chunk>"},
        ],
        "format": CANDIDATE_SCHEMA,          # Ollama structured output
        "stream": False,
        "options": {"temperature": 0.1},
    }
    resp = _post_json("http://localhost:11434/api/chat", body)
    content = resp.get("message", {}).get("content", "")
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        raise AbsorbError("E_PERMANENT_LLM_BAD_JSON", content[:200])
    out = []
    for c in parsed.get("candidates", []):
        if isinstance(c, dict) and c.get("title") and c.get("intent_description"):
            out.append(c)
    return out


# ── Document selection + chunking ────────────────────────────────────

def pending_documents(limit: int | None) -> list[dict]:
    """Documents with a delivered pg.harvests artifact and no consumer watermark."""
    sql = """
      SELECT d.id::text, d.title, d.metadata->>'content_hash' AS content_hash,
             a.ref->>'harvest_id' AS harvest_id,
             count(s.seg_index)::int AS seg_count
      FROM absorb.documents d
      JOIN absorb.artifacts a ON a.document_id = d.id AND a.artifact_type='pg.harvests'
      LEFT JOIN absorb.segments s ON s.document_id = d.id
      WHERE NOT EXISTS (
        SELECT 1 FROM absorb.watermarks w
        WHERE w.profile_id=%s AND w.profile_version=%s
          AND w.source_fingerprint = d.id::text)
      GROUP BY d.id, d.title, content_hash, harvest_id
      ORDER BY d.created_at
      LIMIT %s"""
    return pg_fetchall(sql, (CONSUMER_PROFILE, CONSUMER_VERSION, limit or 10**9))


def document_chunks(document_id: str, max_chars: int) -> list[str]:
    """Group whole discourse-arc segments into ~max_chars chunks (no mid-arc cuts)."""
    units = pg_fetchall(
        """SELECT seg_index, start_turn, end_turn, heading FROM absorb.segments
           WHERE document_id=%s ORDER BY seg_index""", (document_id,))
    turns = pg_fetchall(
        """SELECT turn_index, role, content_md FROM absorb.turns
           WHERE document_id=%s ORDER BY turn_index""", (document_id,))
    by_index = {t["turn_index"]: t for t in turns}
    chunks, buf, size = [], [], 0
    for u in units:
        span = [by_index[i]["content_md"] for i in range(u["start_turn"], u["end_turn"] + 1)
                if i in by_index]
        text = f"[{u['heading'] or 'segment'}]\n" + "\n\n".join(span)
        if size and size + len(text) > max_chars:
            chunks.append("\n\n".join(buf))
            buf, size = [], 0
        buf.append(text)
        size += len(text)
    if buf:
        chunks.append("\n\n".join(buf))
    return chunks


# ── Nebula write-back ────────────────────────────────────────────────

def post_candidate(harvest_id: str, cand: dict, profile_tag: str) -> str:
    snippets = [
        {"language": s.get("language", ""), "purpose": s.get("purpose", ""),
         "rawCode": s.get("raw_code", "")}
        for s in (cand.get("code_snippets") or [])
    ]
    status, body = None, None
    data = json.dumps({
        "harvestId": harvest_id,
        "title": str(cand["title"])[:300],
        "status": cand.get("status", "Proposed"),
        "intentDescription": cand.get("intent_description", ""),
        "implementationNotes": [str(x) for x in (cand.get("implementation_notes") or [])],
        "requirements": [str(x) for x in (cand.get("requirements") or [])],
        "openQuestions": [str(x) for x in (cand.get("open_questions") or [])],
        "codeSnippets": snippets,
        "tags": ["absorb", profile_tag, "candidate-chunking"],
    }).encode()
    req = urllib.request.Request(f"{NEBULA_API}/harvest-candidates", data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.loads(r.read().decode())
        return body.get("id") or ""


def mark_consumed(document_id: str) -> None:
    pg_execute(
        "INSERT INTO absorb.watermarks (profile_id, profile_version, source_fingerprint) "
        "VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
        (CONSUMER_PROFILE, CONSUMER_VERSION, document_id))


# ── Main loop ────────────────────────────────────────────────────────

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="absorb-candidates")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("consume", help="extract candidates from unconsumed documents")
    c.add_argument("--limit", type=int, default=5)
    c.add_argument("--model", default="qwen2.5-coder:latest")
    c.add_argument("--chunk-chars", type=int, default=40000)
    c.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    docs = pending_documents(args.limit)
    print(f"{len(docs)} document(s) pending candidate extraction")
    ok = failed = candidates_written = 0
    for d in docs:
        label = f"{(d['title'] or '?')[:52]}"
        try:
            chunks = document_chunks(d["id"], args.chunk_chars)
            if args.dry_run:
                print(f"  ~ {label} — would run {len(chunks)} chunk(s)")
                continue
            found = []
            t0 = time.time()
            for i, ch in enumerate(chunks):
                found.extend(ollama_chat(args.model, ch))
            wrote = 0
            for cand in found:
                cid = post_candidate(d["harvest_id"], cand, "absorb")
                wrote += 1 if cid else 0
            mark_consumed(d["id"])
            candidates_written += wrote
            ok += 1
            print(f"  ✓ {label} — {len(chunks)} chunk(s), {wrote} candidate(s) "
                  f"[{time.time()-t0:.0f}s]")
        except AbsorbError as err:
            failed += 1
            print(f"  ✗ {label} — [{err.error_code}] ({err.error_class}) {err.message[:120]}")
            # transient → do not watermark; retried next invocation
            if err.error_class == "permanent":
                mark_consumed(d["id"])  # permanent failures don't block the queue

    print(f"\ndone: {ok} | failed: {failed} | candidates written: {candidates_written}")
    return 1 if failed and not ok else 0


if __name__ == "__main__":
    raise SystemExit(main())
