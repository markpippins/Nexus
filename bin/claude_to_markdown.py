#!/usr/bin/env python3
"""
claude_to_markdown.py — Convert a Claude.ai saved-page HTML export to
turn-based Markdown.

Usage:
    python3 claude_to_markdown.py <input.html> [output.md]

Detects turns via:
    - User:    <div data-testid="user-message">
    - Claude:  <div class="group relative relative pb-[var(--msg-assistant-pb,0.75rem)]">
Renders each turn to Markdown preserving code fences, headings, lists,
blockquotes, and paragraphs. Falls back to a generic HTML→MD pass when
the Claude markers are absent.
"""
import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup

USER_TESTID = "user-message"
ASSISTANT_CLASS_MARK = "msg-assistant-pb"
SKIP_TAGS = {"script", "style", "noscript", "meta", "link", "button",
             "svg", "path", "input", "textarea", "iframe", "form"}
BLOCK_TAGS = {"p", "div", "section", "article", "ul", "ol", "li",
              "pre", "blockquote", "table", "tr", "td", "th",
              "h1", "h2", "h3", "h4", "h5", "h6", "hr"}
PUA_RE = re.compile(r"[\ue000-\uf8ff]")


def _clean(text: str) -> str:
    text = PUA_RE.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    # fix space-before-punctuation artifacts from inline mark-wrapping
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    text = re.sub(r"\s+([-])", r" \1", text)
    return text.strip()


def _iter_blocks(el):
    """Yield block-level units in document order, without duplication."""
    if el.name is None:
        return
    cls = " ".join(el.get("class") or [])
    if "sr-only" in cls or el.name in SKIP_TAGS:
        return
    if el.name in ("pre", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "blockquote", "li"):
        yield el
        return
    # container: if it has block-level children, recurse; else yield as leaf
    has_block = any(
        (c.name in BLOCK_TAGS) for c in el.find_all(recursive=False)
    )
    if has_block:
        for c in el.find_all(recursive=False):
            yield from _iter_blocks(c)
    else:
        yield el


def _strip_chrome(el):
    """Remove sr-only text, buttons (status chips / copy), and code-block
    language label chips (text-text-500) from the subtree.

    Decomposes deepest-first so ancestor removals never corrupt the
    traversal, and guards against already-cleared tags.
    """
    targets = [
        t for t in el.find_all(True)
        if (t.name in SKIP_TAGS
            or "sr-only" in " ".join(t.get("class") or [])
            or "text-text-500" in " ".join(t.get("class") or []))
    ]
    targets.sort(key=lambda t: len(list(t.descendants)), reverse=True)
    for t in targets:
        if t.parent is not None and t.name is not None:
            t.decompose()


def _turn_to_md(el) -> str:
    _strip_chrome(el)
    out = []
    for block in _iter_blocks(el):
        name = block.name
        if name == "pre":
            code = block.find("code")
            text = (code.get_text() if code else block.get_text()).rstrip("\n")
            text = PUA_RE.sub("", text)
            if text.strip():
                out.append("```\n" + text + "\n```")
        elif name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            t = _clean(block.get_text(" "))
            if t:
                out.append("#" * int(name[1]) + " " + t)
        elif name == "hr":
            out.append("---")
        elif name == "blockquote":
            t = _clean(block.get_text(" "))
            if t:
                out.append("> " + t)
        elif name == "li":
            t = _clean(block.get_text(" "))
            if t:
                out.append("- " + t)
        else:
            t = _clean(block.get_text(" "))
            if t:
                out.append(t)
    raw = "\n".join(out)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()


def extract_turns(soup):
    marks = []
    for um in soup.find_all("div", attrs={"data-testid": USER_TESTID}):
        marks.append(("user", um))
    for am in soup.find_all("div", class_=lambda c: c and ASSISTANT_CLASS_MARK in c):
        marks.append(("assistant", am))
    marks.sort(key=lambda m: m[1].sourceline if hasattr(m[1], "sourceline") else 0)
    return marks


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 claude_to_markdown.py <input.html> [output.md]", file=sys.stderr)
        sys.exit(1)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".md")
    html = src.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    turns = extract_turns(soup)
    if not turns:
        print("No Claude turn markers found — falling back to generic HTML→MD pass.")
        md = _turn_to_md(soup)
        out.write_text(md, encoding="utf-8")
        print(f"Wrote {out} ({len(md.splitlines())} lines, generic)")
        return

    blocks = []
    for speaker, el in turns:
        md = _turn_to_md(el)
        if not md:
            continue
        heading = "## User" if speaker == "user" else "## Claude"
        blocks.append(f"{heading}\n\n{md}")

    result = "\n\n---\n\n".join(blocks) + "\n"
    out.write_text(result, encoding="utf-8")
    print(f"Wrote {out} ({len(blocks)} turns: "
          f"{sum(1 for s, _ in turns if s == 'user')} user, "
          f"{sum(1 for s, _ in turns if s == 'assistant')} assistant)")


if __name__ == "__main__":
    main()
