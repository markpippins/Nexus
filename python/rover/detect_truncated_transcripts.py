#!/usr/bin/env python3
"""Detect truncated chat-transcript HTML files and emit an HTML reference report.

Background
----------
Rover/harvest captures of chat exports are truncated when the page is dumped
before the virtualized DOM finishes loading: only the visible viewport is
saved, so the file's *first* message is an assistant/model reply that starts
mid-conversation (mid-sentence) instead of the opening user turn.

This is the "transcript chunks start mid-conversation" defect documented in
the harvest-pipeline debug report.  The canonical completeness check is:

    "the first message element must be a USER turn; anything else fails."

This script is a standalone, dependency-free (Python 3 stdlib only) scanner
that runs that check across every transcript HTML file in a directory and
writes ``_truncated-transcripts.html`` — a self-contained report with links to
every affected file — so it can be run on a cron task as a running reference
for malformed source files.

Detected formats (by first-message marker):
    chatgpt   ``data-message-author-role="..."``        first value != "user"
    claude    ``<article role="article">``              aria-posinset != 1, or
                                                        first prefix is an
                                                        assistant prefix
    gemini    ``<user-query>`` / ``<model-response>``   model-response first
    opencode  ``data-component="user-message"``         assistant text marker
                                                        precedes user-message

Files matching none of the above are reported under "unrecognized format"
(they are not transcripts in any known shape — e.g. saved search pages or
plain analysis documents) rather than being silently ignored.

Usage
-----
    python3 detect_truncated_transcripts.py
    python3 detect_truncated_transcripts.py --chats-dir /home/codex/dev/chats
    python3 detect_truncated_transcripts.py --output /tmp/truncated.html

Defaults resolve ``./chats`` relative to the current working directory, which
matches the ``./chats`` source folder under the dev workspace.  For cron, pass
absolute ``--chats-dir`` and ``--output``.

The script always exits 0 (it is a reporting tool, not a gate).  It prints a
one-line summary to stdout and writes the report to ``--output``.
"""

import argparse
import glob
import html
import os
import re
import sys
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Detection primitives
# ---------------------------------------------------------------------------

# First-turn markers, keyed by format name.  Each entry is a regex that, when
# it matches the raw file text, means "this is the first message element".
_CHATGPT_RE = re.compile(r'data-message-author-role\s*=\s*["\']([^"\']+)["\']')
# Claude/Copilot exports tag message nodes with role="article" on a <div> (not
# necessarily an <article> element), so match the role attribute anywhere.
_CLAUDE_ROLE_RE = re.compile(r'role\s*=\s*["\']article["\']', re.IGNORECASE)
_ARIA_POSINSET_RE = re.compile(r'aria-posinset\s*=\s*["\'](\d+)["\']',
                               re.IGNORECASE)
_GEMINI_USER_RE = re.compile(r'<user-query\b', re.IGNORECASE)
_GEMINI_MODEL_RE = re.compile(r'<model-response\b', re.IGNORECASE)
_OPENCODE_USER_RE = re.compile(r'data-component\s*=\s*["\']user-message["\']',
                               re.IGNORECASE)
_OPENCODE_ASSISTANT_RES = [
    re.compile(r'data-component\s*=\s*["\']text-shimmer["\']', re.IGNORECASE),
    re.compile(r'data-component\s*=\s*["\']text-part["\']', re.IGNORECASE),
    re.compile(r'data-component\s*=\s*["\']markdown["\']', re.IGNORECASE),
]

# Claude exports that predate the aria-posinset "Message N of M" format
# identify speaker by a text prefix inside the article.
_USER_PREFIXES = ("You said",)
_ASSISTANT_PREFIXES = (
    "Claude responded", "Claude said", "Copilot said", "ChatGPT said",
    "Gemini said", "Assistant responded", "Assistant said", "Assistant:",
)

# Files with these suffixes are scanned; everything else (asset folders,
# harvested markdown, images) is ignored.
_TRANSCRIPT_SUFFIXES = (".html", ".htm")

_TAG_STRIP_RE = re.compile(r"<[^>]+>")


def _read_text(path):
    with open(path, "rb") as fh:
        return fh.read().decode("utf-8", errors="replace")


def _strip_tags(text):
    return _TAG_STRIP_RE.sub(" ", text)


def _collapse(text):
    return re.sub(r"\s+", " ", text).strip()


def _after_tag(raw, pos):
    """Advance past the closing '>' of the opening tag that contains ``pos``."""
    gt = raw.find(">", pos)
    return gt + 1 if gt != -1 else pos


def _first_turn_snippet(raw, pos, limit=140):
    """Extract a short visible-text snippet of the first message.

    ``pos`` points just after the marker; we take a window, strip tags and
    collapse whitespace so the report shows that the turn starts mid-thought.
    """
    window = raw[pos:pos + 4000]
    text = _collapse(_strip_tags(window))
    if len(text) > limit:
        text = text[:limit].rstrip() + "\u2026"
    return text


def _classify_chatgpt(raw):
    m = _CHATGPT_RE.search(raw)
    if not m:
        return None
    role = m.group(1).strip().lower()
    # The completeness rule: first message must be a user turn.
    truncated = role != "user"
    return {
        "format": "chatgpt",
        "first_turn": role,
        "truncated": truncated,
        "detail": f"first message role = {role!r}",
        "snippet": _first_turn_snippet(raw, _after_tag(raw, m.end())),
    }


def _classify_claude(raw):
    m = _CLAUDE_ROLE_RE.search(raw)
    if not m:
        return None

    # Locate the enclosing opening tag (attribute may be preceded by other
    # attributes) so we can read aria-posinset, then read the text after it.
    tag_start = raw.rfind("<", 0, m.start())
    tag_end = raw.find(">", m.end())
    if tag_start == -1 or tag_end == -1:
        return None
    tag = raw[tag_start:tag_end + 1]
    body_start = tag_end + 1

    # Newer Claude/Copilot exports tag the opening node with the message
    # ordinal ("Message N of M"); any first ordinal != 1 means the capture
    # started mid-conversation regardless of speaker.
    pm = _ARIA_POSINSET_RE.search(tag)
    if pm:
        n = int(pm.group(1))
        snippet = _first_turn_snippet(raw, body_start)
        return {
            "format": "claude",
            "first_turn": f"message-{n}",
            "truncated": n != 1,
            "detail": f"first message is message {n} of the conversation",
            "snippet": snippet,
        }

    # Legacy Claude exports identify speaker by a text prefix.
    text = _collapse(_strip_tags(raw[body_start:body_start + 2000]))
    if text.startswith(_USER_PREFIXES):
        first, truncated = "user", False
        detail = "first message prefix = user"
    elif text.startswith(_ASSISTANT_PREFIXES):
        first, truncated = "assistant", True
        detail = "first message prefix = assistant"
    else:
        first, truncated, detail = "unknown", False, "first message prefix unrecognized"
    return {
        "format": "claude",
        "first_turn": first,
        "truncated": truncated,
        "detail": detail,
        "snippet": _first_turn_snippet(raw, body_start),
    }


def _classify_gemini(raw):
    uq = _GEMINI_USER_RE.search(raw)
    mr = _GEMINI_MODEL_RE.search(raw)
    if not uq and not mr:
        return None
    user_pos = uq.start() if uq else None
    model_pos = mr.start() if mr else None
    if user_pos is not None and (model_pos is None or user_pos < model_pos):
        first, truncated = "user", False
        snippet_pos = _after_tag(raw, uq.end())
    else:
        first, truncated = "model", True
        snippet_pos = _after_tag(raw, mr.end())
    return {
        "format": "gemini",
        "first_turn": first,
        "truncated": truncated,
        "detail": f"first turn = {first}",
        "snippet": _first_turn_snippet(raw, snippet_pos),
    }


def _classify_opencode(raw):
    um = _OPENCODE_USER_RE.search(raw)
    if not um and 'data-component="session-turn"' not in raw:
        return None
    assistant_pos = None
    for rx in _OPENCODE_ASSISTANT_RES:
        m = rx.search(raw)
        if m and (assistant_pos is None or m.start() < assistant_pos):
            assistant_pos = m.start()
    if um and (assistant_pos is None or um.start() < assistant_pos):
        first, truncated = "user", False
        snippet_pos = _after_tag(raw, um.end())
    else:
        first, truncated = "assistant", True
        snippet_pos = _after_tag(raw, assistant_pos if assistant_pos is not None else um.end())
    return {
        "format": "opencode",
        "first_turn": first,
        "truncated": truncated,
        "detail": f"first turn = {first}",
        "snippet": _first_turn_snippet(raw, snippet_pos),
    }


def scan_transcripts(chats_dir, skip_report_prefix="_truncated-transcripts"):
    """Return ``analyze_file()`` results for every transcript file in a dir.

    Excludes the generated report (and any stale variants) by filename prefix
    so re-runs never scan their own output.  Scans only the top level (asset
    subfolders like ``*_files/`` are ignored).
    """
    chats_dir = os.path.abspath(chats_dir)
    files = []
    for suffix in _TRANSCRIPT_SUFFIXES:
        files.extend(sorted(glob.glob(os.path.join(chats_dir, "*" + suffix))))
    seen = set()
    files = [f for f in files
             if not (f in seen or seen.add(f))
             and not os.path.basename(f).startswith(skip_report_prefix)]
    return [analyze_file(f) for f in files]


def truncated_filenames(chats_dir, skip_report_prefix="_truncated-transcripts"):
    """Return the set of transcript basenames whose first turn is truncated.

    Reusable by the harvest candidate guard to skip truncated sources.
    """
    return {r["name"] for r in scan_transcripts(chats_dir, skip_report_prefix)
            if r["truncated"]}


def analyze_file(path):
    """Return a status dict for one transcript file (or None on read error)."""
    try:
        raw = _read_text(path)
    except OSError as exc:
        return {
            "path": path,
            "name": os.path.basename(path),
            "size": -1,
            "format": "error",
            "first_turn": None,
            "truncated": False,
            "detail": f"unreadable: {exc}",
            "snippet": "",
        }

    for classifier in (_classify_chatgpt, _classify_claude,
                       _classify_gemini, _classify_opencode):
        result = classifier(raw)
        if result is not None:
            result["path"] = path
            result["name"] = os.path.basename(path)
            result["size"] = os.path.getsize(path)
            return result

    return {
        "path": path,
        "name": os.path.basename(path),
        "size": os.path.getsize(path),
        "format": "unrecognized",
        "first_turn": None,
        "truncated": False,
        "detail": "no known transcript markers",
        "snippet": "",
    }


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def _esc(text):
    return html.escape(text, quote=True)


def _render_report(results, scanned_dir, generated_at):
    truncated = [r for r in results if r["truncated"]]
    unrecognized = [r for r in results if r["format"] == "unrecognized"]
    errors = [r for r in results if r["format"] == "error"]
    ok_count = len(results) - len(truncated) - len(unrecognized) - len(errors)

    def row(r):
        link = _esc(r["name"])
        href = f'href="{_esc(r["name"])}"'
        size_kb = f'{r["size"] / 1024:.0f} KB' if r["size"] >= 0 else "?"
        return (
            f'<tr><td><a {href}>{link}</a></td>'
            f'<td>{_esc(r["format"])}</td>'
            f'<td>{_esc(r["first_turn"] or "—")}</td>'
            f'<td>{_esc(r["detail"])}</td>'
            f'<td>{size_kb}</td>'
            f'<td class="snippet">{_esc(r["snippet"])}</td></tr>'
        )

    truncated_rows = "\n".join(row(r) for r in sorted(truncated, key=lambda x: x["name"].lower()))
    unrecognized_rows = "\n".join(row(r) for r in sorted(unrecognized, key=lambda x: x["name"].lower()))
    error_rows = "\n".join(row(r) for r in sorted(errors, key=lambda x: x["name"].lower()))

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Truncated transcripts &mdash; {_esc(scanned_dir)}</title>
<style>
  body {{ font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         margin: 2rem auto; max-width: 1100px; padding: 0 1rem; color: #1a1a1a; }}
  h1 {{ font-size: 1.4rem; }}
  .meta {{ color: #555; font-size: 0.85rem; margin-bottom: 1.5rem; }}
  .counts {{ display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; }}
  .count {{ border: 1px solid #ddd; border-radius: 8px; padding: 0.6rem 1rem; min-width: 8rem; }}
  .count .n {{ font-size: 1.6rem; font-weight: 600; display: block; }}
  .count.bad .n {{ color: #b00020; }}
  .count.ok .n {{ color: #1b7a3d; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 0.85rem; }}
  th, td {{ border: 1px solid #e0e0e0; padding: 0.4rem 0.6rem; text-align: left;
            vertical-align: top; }}
  th {{ background: #f5f5f5; position: sticky; top: 0; }}
  td.snippet {{ color: #555; max-width: 34rem; word-break: break-word; }}
  a {{ color: #0b57d0; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  h2 {{ font-size: 1.05rem; margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem; }}
  details {{ margin-top: 1rem; }}
  summary {{ cursor: pointer; font-weight: 600; }}
  .foot {{ color: #777; font-size: 0.78rem; margin-top: 2rem; }}
</style>
</head>
<body>
<h1>Truncated transcripts</h1>
<div class="meta">
  Scanned: <code>{_esc(scanned_dir)}</code> &middot;
  Generated: {_esc(generated_at)} UTC
</div>
<div class="counts">
  <div class="count bad"><span class="n">{len(truncated)}</span>truncated</div>
  <div class="count ok"><span class="n">{ok_count}</span>ok</div>
  <div class="count"><span class="n">{len(unrecognized)}</span>unrecognized</div>
  <div class="count"><span class="n">{len(errors)}</span>errors</div>
  <div class="count"><span class="n">{len(results)}</span>total</div>
</div>

<h2>Truncated ({len(truncated)}) &mdash; first turn is assistant/model, mid-conversation</h2>
<table>
  <tr><th>File</th><th>Format</th><th>First turn</th><th>Detail</th><th>Size</th><th>First-turn text</th></tr>
  {truncated_rows or '<tr><td colspan="6">None</td></tr>'}
</table>

<details>
  <summary>Unrecognized format ({len(unrecognized)}) &mdash; not a known transcript shape</summary>
  <table>
    <tr><th>File</th><th>Format</th><th>First turn</th><th>Detail</th><th>Size</th><th>First-turn text</th></tr>
    {unrecognized_rows or '<tr><td colspan="6">None</td></tr>'}
  </table>
</details>

{('<details><summary>Read errors (' + str(len(errors)) + ')</summary><table>'
  '<tr><th>File</th><th>Format</th><th>First turn</th><th>Detail</th><th>Size</th>'
  '<th>First-turn text</th></tr>' + error_rows + '</table></details>') if errors else ''}

<p class="foot">
  Generated by detect_truncated_transcripts.py. Links are relative to this
  report, which lives in the same folder as the scanned files.
</p>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Detect truncated chat transcripts and write an HTML report.")
    parser.add_argument(
        "--chats-dir", default="chats",
        help="Directory containing source transcript HTML files (default: ./chats).")
    parser.add_argument(
        "--output", default=None,
        help="Output HTML path (default: <chats-dir>/_truncated-transcripts.html).")
    parser.add_argument(
        "--quiet", action="store_true",
        help="Suppress the stdout summary line.")
    args = parser.parse_args(argv)

    chats_dir = os.path.abspath(args.chats_dir)
    output = args.output or os.path.join(chats_dir, "_truncated-transcripts.html")

    if not os.path.isdir(chats_dir):
        print(f"error: chats directory not found: {chats_dir}", file=sys.stderr)
        return 2

    results = scan_transcripts(chats_dir)
    truncated = [r for r in results if r["truncated"]]
    unrecognized = [r for r in results if r["format"] == "unrecognized"]
    errors = [r for r in results if r["format"] == "error"]

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    report = _render_report(results, chats_dir, generated_at)

    with open(output, "w", encoding="utf-8") as fh:
        fh.write(report)

    if not args.quiet:
        print(
            f"scanned={len(results)} truncated={len(truncated)} "
            f"unrecognized={len(unrecognized)} errors={len(errors)} "
            f"-> {output}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
