"""Adapters: source format -> NormalizedDocument.

NormalizedDocument shape:
    {title, metadata{}, turns: [{index, role, content_md, ts}]}
"""

from __future__ import annotations

import re
from pathlib import Path


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Minimal YAML-frontmatter splitter (flat key: value lines only —
    sufficient for chat-export exports; avoids a hard PyYAML dependency)."""
    if not text.startswith("---"):
        return {}, text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?", text, re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip().strip('"')
    return meta, text[m.end():]


def parse_chatgpt_export_markdown(path: str) -> dict:
    """utils/chat-export markdown: frontmatter + '# Title' + '## User'/'## Assistant'."""
    raw = Path(path).read_text(encoding="utf-8", errors="replace")
    fm, body = _parse_frontmatter(raw)

    # Strip the leading '# Title' heading; title comes from frontmatter/enrich.
    body = re.sub(r"^\s*#\s+.+?\n", "", body, count=1)

    turns, role_buf, cur_role = [], [], None
    for block in re.split(r"\n(?=## (?:User|Assistant)\b)", body):
        m = re.match(r"## (User|Assistant)\s*\n", block)
        if not m:
            if cur_role is None and block.strip():
                # preamble before first turn — fold into nothing (rare)
                continue
            if cur_role:
                role_buf.append(block)
            continue
        if cur_role is not None:
            turns.append((cur_role, "\n".join(role_buf).strip()))
        cur_role, role_buf = m.group(1).lower(), [block[m.end():]]

    if cur_role is not None:
        turns.append((cur_role, "\n".join(role_buf).strip()))

    return {
        "title": fm.get("title") or Path(path).stem,
        "metadata": {
            "conversation_id": fm.get("id"),
            "created_at": fm.get("create_time"),
            "updated_at": fm.get("update_time"),
            "project_id": fm.get("project_id"),
            "frontmatter": {k: v for k, v in fm.items()},
        },
        "turns": [
            {"index": i, "role": role, "content_md": content}
            for i, (role, content) in enumerate(turns)
            if content
        ],
    }


def parse_generic_document(path: str) -> dict:
    """Fallback adapter: docling transform would slot in here. For the slice,
    markdown-ish files are parsed with the same turn heuristic."""
    return parse_chatgpt_export_markdown(path)


ADAPTERS = {
    "chatgpt_export_markdown": parse_chatgpt_export_markdown,
    "generic_document": parse_generic_document,
}


def get_adapter(fmt: str):
    fn = ADAPTERS.get(fmt)
    if fn is None:
        raise KeyError(f"no adapter registered for format {fmt!r}")
    return fn


# ── Enrich step ───────────────────────────────────────────────────────

FILENAME_RE_DEFAULT = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})_(?P<title>.+)_(?P<conv_id>[0-9a-f-]{8,36})\.md$"
)


def enrich_filename_metadata(doc: dict, path: str, cfg: dict) -> tuple[dict, list[str]]:
    """Extract filename metadata as DATA (spec requirement: date prefixes are
    fields, never titles/names). Returns (updated_doc_fields, warnings)."""
    warnings: list[str] = []
    pattern = FILENAME_RE_DEFAULT
    name = Path(path).name
    m = pattern.match(name)
    fields = {}
    fallback_title = None
    if cfg:
        pat = cfg.get("pattern")
        if pat:
            pattern = re.compile(pat)
        fb = cfg.get("fallback") or {}
        fallback_title = fb.get("title")
        if fb.get("metadata.source_date") == "now()":
            from datetime import date
            fields.setdefault("source_date", date.today().isoformat())

    if m:
        gd = m.groupdict()
        if gd.get("date"):
            fields["source_date"] = gd["date"]
        if gd.get("conv_id"):
            fields["conversation_id"] = fields.get(
                "conversation_id", doc["metadata"].get("conversation_id") or gd["conv_id"]
            )
        if gd.get("title") and cfg and cfg.get("strip_from_title", True):
            fields["title"] = gd["title"].replace("_", " ").strip()
    else:
        warnings.append(f"W_ENRICH_FILENAME_NO_MATCH:{name}")
        if fallback_title and (not doc.get("title") or doc["title"] == Path(path).stem):
            fields["title"] = fallback_title
    return fields, warnings
