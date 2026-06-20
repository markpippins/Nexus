#!/usr/bin/env python3
"""
rover-mcp: Agent-in-the-loop transcript harvesting MCP server.

Replaces the Qwen/Ollama extraction step in harvest_pipeline.py with an
MCP tool interface. The pipeline (Docling → chunking) runs server-side.
The LLM agent (you) calls get_pending_chunk to pull the next chunk, does
the extraction, and submits results via submit_extraction. When all chunks
are done, compile_agenda writes the final Markdown.

Usage:
    python3 rover_mcp_server.py
"""

import json
import logging
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

from harvest_pipeline import (
    CODE_HARVESTER_PROMPT,
    agenda_to_markdown,
    chunk_text,
    convert_to_markdown,
)
from schemas import SpecificationAgenda

# ── logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("rover-mcp")

# ── server ───────────────────────────────────────────────────────────
mcp = FastMCP("rover-mcp")

# ── job store ────────────────────────────────────────────────────────
# In-memory store. Restarting the MCP server loses state — jobs are
# meant to be processed in one session.
_jobs: dict[str, dict[str, Any]] = {}


def _new_job_id() -> str:
    return uuid.uuid4().hex[:8]


# ── tools ────────────────────────────────────────────────────────────

@mcp.tool()
def rover_submit_transcript(transcript_path: str) -> str:
    """Submit an HTML chat transcript for harvesting.

    Runs Docling conversion and chunks the resulting Markdown. Returns a
    job_id for use with the other rover tools.

    Args:
        transcript_path: Absolute or relative path to the HTML transcript file.
    """
    job_id = _new_job_id()
    log.info("[%s] submit_transcript(%s)", job_id, transcript_path)

    path = Path(transcript_path)
    if not path.exists():
        return json.dumps({"error": f"File not found: {transcript_path}"})

    try:
        markdown = convert_to_markdown(str(path))
    except Exception as exc:
        log.exception("[%s] Docling conversion failed", job_id)
        return json.dumps({"error": f"Docling conversion failed: {exc}"})

    chunks = chunk_text(markdown)
    if not chunks:
        return json.dumps({"error": "No text chunks produced from input"})

    _jobs[job_id] = {
        "transcript_path": str(path),
        "chunks": chunks,
        "extractions": {},
        "total_chunks": len(chunks),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Show a preview of the first chunk so the caller can confirm it's
    # the right transcript.
    preview = chunks[0][:500] + "..." if len(chunks[0]) > 500 else chunks[0]

    return json.dumps(
        {
            "job_id": job_id,
            "total_chunks": len(chunks),
            "preview_chunk_0": preview,
            "system_prompt": CODE_HARVESTER_PROMPT,
            "next": "Call rover_get_pending_chunk(job_id) to get the first chunk.",
        },
        indent=2,
    )


async def _call_ollama(chunk_text: str, ollama_url: str, model: str) -> dict | None:
    """Call Ollama with structured output. Returns parsed JSON or None."""
    schema = SpecificationAgenda.model_json_schema()
    estimated = len(chunk_text) // 4
    ctx = max(8192, min(65536, estimated + 4096))
    try:
        async with httpx.AsyncClient(timeout=600.0) as client:
            resp = await client.post(
                f"{ollama_url.rstrip('/')}/api/chat",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": CODE_HARVESTER_PROMPT},
                        {"role": "user", "content": f"Analyze this chat log and harvest all architectural specifications and code blocks:\n\n{chunk_text}"},
                    ],
                    "format": schema,
                    "options": {"num_ctx": ctx, "temperature": 0.1, "num_thread": 3},
                    "stream": False,
                },
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"]
    except Exception as e:
        log.warning("Ollama call failed: %s", e)
        return None


@mcp.tool()
async def rover_get_pending_chunk(job_id: str, ollama_url: str = "", model: str = "qwen3:4b") -> str:
    """Get the next unprocessed chunk for a submitted transcript.

    If ollama_url is provided, the chunk is automatically sent to the
    specified Ollama endpoint for NLP extraction. The result is returned
    as nlp_proposal alongside the raw chunk_text. The caller reviews the
    proposal and submits via rover_submit_extraction.

    Args:
        job_id: The job ID returned by rover_submit_transcript.
        ollama_url: Optional Ollama server URL (e.g. http://strontium:11434).
                    If empty, NLP extraction is skipped.
        model: Ollama model name (default qwen3:4b). Ignored if ollama_url is empty.
    """
    job = _jobs.get(job_id)
    if job is None:
        return json.dumps({"error": f"Unknown job_id: {job_id}"})

    total = job["total_chunks"]
    completed = set(job["extractions"].keys())

    for i in range(total):
        if i not in completed:
            chunk = job["chunks"][i]
            result = {
                "job_id": job_id,
                "chunk_index": i,
                "total_chunks": total,
                "completed_count": len(completed),
                "pending_count": total - len(completed),
                "chunk_text": chunk,
                "system_prompt": CODE_HARVESTER_PROMPT,
                "next": "Call rover_submit_extraction(job_id, chunk_index, agenda_json) with your structured extraction.",
            }

            # Optional: run NLP extraction
            if ollama_url:
                log.info("[%s] Calling Ollama %s/%s for chunk %d...", job_id, ollama_url, model, i)
                nlp_raw = await _call_ollama(chunk, ollama_url, model)
                if nlp_raw:
                    try:
                        nlp_data = json.loads(nlp_raw)
                        verdict = "content" if nlp_data.get("agenda_items") else "noise"
                        result["nlp_proposal"] = nlp_data
                        result["nlp_verdict"] = verdict
                        result["nlp_model"] = model
                        log.info("  → verdict=%s, %d items", verdict, len(nlp_data.get("agenda_items", [])))
                    except json.JSONDecodeError:
                        log.warning("  → Ollama returned invalid JSON")
                else:
                    result["nlp_error"] = "Ollama call failed"

            return json.dumps(result, indent=2)

    return json.dumps(
        {
            "job_id": job_id,
            "done": True,
            "total_chunks": total,
            "completed_count": len(completed),
            "next": "All chunks processed. Call rover_compile_agenda(job_id, output_path) to write the final document.",
        },
        indent=2,
    )


@mcp.tool()
def rover_submit_extraction(
    job_id: str, chunk_index: int, agenda_json: str
) -> str:
    """Submit extracted specification candidates for a chunk.

    Args:
        job_id: The job ID returned by rover_submit_transcript.
        chunk_index: The chunk index from rover_get_pending_chunk.
        agenda_json: A JSON string matching the SpecificationAgenda schema.
                      Must be a valid JSON object with an "agenda_items" array.
    """
    job = _jobs.get(job_id)
    if job is None:
        return json.dumps({"error": f"Unknown job_id: {job_id}"})

    if chunk_index < 0 or chunk_index >= job["total_chunks"]:
        return json.dumps(
            {"error": f"chunk_index {chunk_index} out of range [0, {job['total_chunks'] - 1}]"}
        )

    try:
        data = json.loads(agenda_json)
        # Validate against the schema.
        agenda = SpecificationAgenda.model_validate(data)
    except (json.JSONDecodeError, ValueError) as exc:
        return json.dumps({"error": f"Invalid agenda JSON: {exc}"})

    job["extractions"][chunk_index] = agenda.model_dump()
    remaining = job["total_chunks"] - len(job["extractions"])

    log.info("[%s] chunk %d stored — %d items, %d remaining chunks",
             job_id, chunk_index, len(agenda.agenda_items), remaining)

    if remaining == 0:
        return json.dumps(
            {
                "job_id": job_id,
                "chunk_index": chunk_index,
                "items_extracted": len(agenda.agenda_items),
                "remaining_chunks": 0,
                "next": "All chunks done! Call rover_compile_agenda(job_id, output_path) to write the final document.",
            },
            indent=2,
        )

    return json.dumps(
        {
            "job_id": job_id,
            "chunk_index": chunk_index,
            "items_extracted": len(agenda.agenda_items),
            "remaining_chunks": remaining,
            "next": "Call rover_get_pending_chunk(job_id) to get the next chunk.",
        },
        indent=2,
    )


@mcp.tool()
def rover_compile_agenda(job_id: str, output_path: str) -> str:
    """Compile all extractions into the final Markdown specification document.

    Args:
        job_id: The job ID returned by rover_submit_transcript.
        output_path: Path to write the final Markdown file.
    """
    job = _jobs.get(job_id)
    if job is None:
        return json.dumps({"error": f"Unknown job_id: {job_id}"})

    total = job["total_chunks"]
    extractions = job["extractions"]

    if len(extractions) == 0:
        return json.dumps({"error": "No extractions have been submitted yet."})

    # Reassemble in chunk order.
    combined = SpecificationAgenda(agenda_items=[])
    failures = 0
    for i in range(total):
        data = extractions.get(i)
        if data is None:
            failures += 1
            continue
        try:
            agenda = SpecificationAgenda.model_validate(data)
            combined.agenda_items.extend(agenda.agenda_items)
        except Exception:
            failures += 1

    # Ensure the ROVER/ audit folder exists for storing compiled output
    audit_rover_path = Path(__file__).resolve().parent.parent.parent.parent / "nexus" / "audit" / "ROVER"
    audit_rover_path.mkdir(parents=True, exist_ok=True)

    md_lines = ["# Harvested Specification & Code Repository\n"]
    md_lines.append(f"**Source:** `{job['transcript_path']}`\n")
    md_lines.append(f"**Chunks processed:** {total}  **Failed:** {failures}\n")
    md_lines.append(f"**Total candidates:** {len(combined.agenda_items)}\n")
    md_lines.append(f"**Audit folder:** `{audit_rover_path}`\n")
    md_lines.append("---\n")

    # Rebuild per-chunk agendas for the markdown output.
    for i in range(total):
        data = extractions.get(i)
        if data is None:
            continue
        try:
            agenda = SpecificationAgenda.model_validate(data)
            md_lines.append(agenda_to_markdown(agenda, chunk_label=f"chunk-{i}"))
        except Exception:
            pass

    output = "\n".join(md_lines)

    out_path = Path(output_path)
    # If output_path is relative and doesn't specify a directory, default to audit ROVER/
    if not out_path.is_absolute() and out_path.parent == Path("."):
        out_path = audit_rover_path / out_path.name
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(output)

    log.info("[%s] Wrote %s — %d items, %d failures",
             job_id, output_path, len(combined.agenda_items), failures)

    return json.dumps(
        {
            "job_id": job_id,
            "output_path": str(out_path),
            "total_chunks": total,
            "failed_chunks": failures,
            "total_candidates": len(combined.agenda_items),
        },
        indent=2,
    )


@mcp.tool()
def rover_job_status(job_id: str) -> str:
    """Check the progress of a submitted transcript job.

    Args:
        job_id: The job ID returned by rover_submit_transcript.
    """
    job = _jobs.get(job_id)
    if job is None:
        return json.dumps({"error": f"Unknown job_id: {job_id}"})

    completed = len(job["extractions"])
    total = job["total_chunks"]

    return json.dumps(
        {
            "job_id": job_id,
            "transcript_path": job["transcript_path"],
            "created_at": job["created_at"],
            "total_chunks": total,
            "completed_chunks": completed,
            "pending_chunks": total - completed,
            "done": completed == total,
        },
        indent=2,
    )


# ── entrypoint ───────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("rover-mcp starting on stdio")
    mcp.run()
