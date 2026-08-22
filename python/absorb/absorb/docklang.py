"""DockLang compiler: NormalizedDocument + segments -> complete DockLangDocument.

Shape mirrors the legacy discourse_units model (lineage-compatible):
units[{heading, body, blocks[{type, content, provenance{block_index, role}}],
provenance{segment_index, start_turn, end_turn, turn_count, boundary_reason,
block_count}}] — one unit per discourse arc.
"""

from __future__ import annotations


def compile_docklang(doc: dict, segments: list[dict], extra_meta: dict | None = None) -> dict:
    turns = doc["turns"]
    units = []
    for seg in segments:
        span = turns[seg["start_turn"]: seg["end_turn"] + 1]
        blocks = []
        parts = []
        for t in span:
            content = t["content_md"]
            if not content:
                continue
            parts.append(content)
            blocks.append({
                "type": "paragraph",
                "content": content,
                "provenance": {"block_index": t["index"], "role": t["role"]},
            })
        role = span[0]["role"] if span else "unknown"
        units.append({
            "heading": seg.get("heading") or f"Segment {seg['segment_index']}",
            "body": "\n\n".join(parts),
            "blocks": blocks,
            "provenance": {
                "role": role,
                "segment_index": seg["segment_index"],
                "start_turn": seg["start_turn"],
                "end_turn": seg["end_turn"],
                "turn_count": seg["turn_count"],
                "boundary_reason": seg.get("boundary_reason"),
                "block_count": len(blocks),
            },
        })

    meta = dict(doc.get("metadata") or {})
    meta.update(extra_meta or {})
    return {
        "title": doc.get("title"),
        "metadata": meta,
        "turn_count": len(turns),
        "segment_count": len(segments),
        "discourse_units": units,
    }
