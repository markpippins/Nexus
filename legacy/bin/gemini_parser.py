#!/usr/bin/env python3
"""
Gemini 3 HTML parser — extracts conversations from browser-saved Gemini HTML.

Input: Gemini HTML file(s) with Angular conversation-container structure
Output: NormalizedTranscript JSON (same shape as deepseek_parser.py)

Usage:
  # Parse a single file:
  python3 gemini_parser.py /path/to/gemini.html --output json

  # Parse all HTML files in a directory:
  python3 gemini_parser.py /path/to/chats/ --output json

  # Markdown output:
  python3 gemini_parser.py /path/to/gemini.html --output markdown
"""

import argparse
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone

try:
    from bs4 import BeautifulSoup, NavigableString
except ImportError:
    print("ERROR: beautifulsoup4 not installed. Run: pip install --break-system-packages beautifulsoup4 lxml", file=sys.stderr)
    sys.exit(1)


# ── Helpers ────────────────────────────────────────────────────────

def _clean_text(text):
    """Strip extra whitespace and Angular noise."""
    if not text:
        return ""
    # Collapse whitespace but preserve paragraph breaks
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _extract_markdown(element):
    """
    Extract rendered HTML content from a Gemini response and convert
    back to approximate markdown.
    """
    if not element:
        return ""

    parts = []

    for child in element.descendants:
        if isinstance(child, NavigableString):
            continue

        tag = child.name if hasattr(child, 'name') else None
        if not tag:
            continue

        # Skip noise elements
        if tag in ('response-element', 'source-footnote', 'source-inline-chip',
                    'sources-carousel-inline', 'sources-list', 'sup',
                    'thinking-overlay', 'script', 'style'):
            continue

    # Simpler approach: extract text with structural markers
    return _element_to_markdown(element)


def _element_to_markdown(element):
    """Convert an HTML element tree to approximate markdown."""
    if not element:
        return ""

    parts = []

    def _walk(el):
        if isinstance(el, NavigableString):
            text = str(el).strip()
            if text:
                parts.append(text)
            return

        if not hasattr(el, 'name') or not el.name:
            return

        tag = el.name

        # Skip noise
        if tag in ('response-element', 'source-footnote', 'source-inline-chip',
                    'sources-carousel-inline', 'sources-list', 'sup',
                    'thinking-overlay', 'script', 'style', 'span',
                    'div', 'message-content', 'structured-content-container',
                    'response-container-content', 'response-content',
                    'presented-response-container', 'response-container',
                    'model-response', 'user-query', 'user-query-content',
                    'response-container-header', 'response-container-footer',
                    'response-footer', 'message-actions', 'actions-container-v2',
                    'thumb-up-button', 'thumb-down-button', 'more-menu-button'):
            # Still recurse into children
            for child in el.children:
                _walk(child)
            return

        if tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            level = int(tag[1])
            text = el.get_text(strip=True)
            if text:
                parts.append(f"\n\n{'#' * level} {text}\n\n")
            return

        if tag == 'p':
            text = el.get_text(strip=True)
            if text:
                parts.append(f"\n\n{text}\n\n")
            return

        if tag in ('ul', 'ol'):
            parts.append("\n\n")
            for i, li in enumerate(el.find_all('li', recursive=False)):
                text = li.get_text(strip=True)
                if tag == 'ol':
                    parts.append(f"{i+1}. {text}\n")
                else:
                    parts.append(f"- {text}\n")
            parts.append("\n")
            return

        if tag == 'code':
            # Inline code
            text = el.get_text()
            if text:
                parts.append(f"`{text}`")
            return

        if tag == 'pre':
            # Code block
            text = el.get_text()
            if text:
                parts.append(f"\n\n```\n{text}\n```\n\n")
            return

        if tag == 'b' or tag == 'strong':
            text = el.get_text(strip=True)
            if text:
                parts.append(f"**{text}**")
            return

        if tag == 'a':
            text = el.get_text(strip=True)
            href = el.get('href', '')
            if text and href:
                parts.append(f"[{text}]({href})")
            elif text:
                parts.append(text)
            return

        # Default: recurse into children
        for child in el.children:
            _walk(child)

    _walk(element)
    return _clean_text("".join(parts))


def _extract_user_query(turn_div):
    """Extract user query text from a conversation-container div."""
    user_query = turn_div.find('user-query')
    if not user_query:
        return ""

    # Try the query text paragraphs
    query_text_div = user_query.find(class_='query-text')
    if query_text_div:
        paragraphs = query_text_div.find_all('p', class_='query-text-line')
        if paragraphs:
            return "\n\n".join(p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True))

    # Fallback: look for query-content div
    query_content = user_query.find(class_='query-content')
    if query_content:
        return query_content.get_text(strip=True)

    # Last resort: get all text from user-query
    return user_query.get_text(strip=True)


def _extract_filenames(turn_div):
    """Extract uploaded filenames from a turn."""
    user_query = turn_div.find('user-query')
    if not user_query:
        return []

    filenames = []
    for label in user_query.find_all(attrs={'data-test-id': 'filename-label'}):
        name = label.get_text(strip=True)
        if name:
            filenames.append(name)

    return filenames


def _extract_model_response(turn_div):
    """Extract model response text from a conversation-container div."""
    model_response = turn_div.find('model-response')
    if not model_response:
        return ""

    # Navigate to the markdown content
    markdown_div = model_response.find(class_='markdown-main-panel')
    if markdown_div:
        return _element_to_markdown(markdown_div)

    # Fallback: structured-content-container
    structured = model_response.find('structured-content-container')
    if structured:
        return _element_to_markdown(structured)

    # Fallback: response-container-content
    content = model_response.find(class_='response-container-content')
    if content:
        return _element_to_markdown(content)

    # Last resort: get all text
    return model_response.get_text(strip=True)


def _extract_conversation_id(html_content, file_path):
    """Extract conversation ID from saved URL or generate one."""
    # Look for saved from URL comment
    match = re.search(r'saved from url=\(\d+\)(https://gemini\.google\.com/app/([a-f0-9]+))', html_content)
    if match:
        return match.group(2)

    # Try from file name
    basename = os.path.splitext(os.path.basename(file_path))[0]
    if basename:
        return basename

    return str(uuid.uuid4())


def _extract_title(soup, file_path):
    """Extract conversation title from <title> tag or file name."""
    title_tag = soup.find('title')
    if title_tag:
        text = title_tag.get_text(strip=True)
        # Remove " - Google Gemini" suffix
        text = re.sub(r'\s*-\s*Google\s*Gemini\s*$', '', text)
        if text:
            return text

    return os.path.splitext(os.path.basename(file_path))[0]


# ── Main parser ────────────────────────────────────────────────────

def parse_gemini_html(file_path):
    """
    Parse a single Gemini HTML file into a NormalizedTranscript.

    Returns: dict (the transcript) or None if parsing fails.
    """
    try:
        with open(file_path, 'r', errors='replace') as f:
            html_content = f.read()
    except Exception as e:
        print(f"  ERROR reading {file_path}: {e}", file=sys.stderr)
        return None

    soup = BeautifulSoup(html_content, 'lxml')

    # Extract metadata
    conv_id = _extract_conversation_id(html_content, file_path)
    title = _extract_title(soup, file_path)

    # Find the conversation container
    scroller = soup.find(attrs={'data-test-id': 'chat-history-container'})
    if not scroller:
        # Try finding conversation-container divs directly
        containers = soup.find_all('div', class_='conversation-container')
        if not containers:
            print(f"  WARNING: No conversation found in {file_path}", file=sys.stderr)
            return None
    else:
        containers = scroller.find_all('div', class_='conversation-container', recursive=False)

    if not containers:
        print(f"  WARNING: No turns found in {file_path}", file=sys.stderr)
        return None

    # Extract turns
    turns = []
    for container in containers:
        # User query
        user_text = _extract_user_query(container)
        filenames = _extract_filenames(container)

        if user_text:
            turn = {
                "role": "user",
                "content": user_text,
            }
            if filenames:
                turn["attachments"] = filenames
            turns.append(turn)

        # Model response
        response_text = _extract_model_response(container)
        if response_text:
            turns.append({
                "role": "assistant",
                "content": response_text,
                "model": "gemini",
            })

    if not turns:
        print(f"  WARNING: No content extracted from {file_path}", file=sys.stderr)
        return None

    # Build the transcript
    return {
        "source_format": "gemini",
        "conversation_id": conv_id,
        "title": title,
        "created_at": None,  # No timestamps in Gemini HTML
        "updated_at": None,
        "as_of_dt": None,
        "valid_from": None,
        "model": "gemini",
        "turns": turns,
        "file_metadata": {
            "source_file": os.path.basename(file_path),
            "file_size": os.path.getsize(file_path),
        },
    }


def parse_directory(dir_path, limit=None):
    """Parse all Gemini HTML files in a directory."""
    results = []
    count = 0

    for root, _dirs, files in os.walk(dir_path):
        for fname in sorted(files):
            if limit and count >= limit:
                return results
            if not (fname.endswith('.html') or fname.endswith('.htm')):
                continue
            fpath = os.path.join(root, fname)

            # Quick check: does this file have Gemini signatures?
            try:
                with open(fpath, 'r', errors='replace') as f:
                    head = f.read(1000000)
                if 'conversation-container' not in head:
                    continue
            except Exception:
                continue

            transcript = parse_gemini_html(fpath)
            if transcript:
                results.append(transcript)
                count += 1

    return results


# ── CLI ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Gemini 3 HTML parser")
    parser.add_argument("path", help="HTML file or directory")
    parser.add_argument("--output", choices=["json", "markdown"], default="json", help="Output format")
    parser.add_argument("--limit", type=int, help="Max files to parse")
    args = parser.parse_args()

    if os.path.isfile(args.path):
        transcript = parse_gemini_html(args.path)
        if not transcript:
            sys.exit(1)
        transcripts = [transcript]
    elif os.path.isdir(args.path):
        transcripts = parse_directory(args.path, args.limit)
    else:
        print(f"ERROR: {args.path} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Parsed {len(transcripts)} conversations from {args.path}", file=sys.stderr)

    if args.output == "json":
        print(json.dumps(transcripts, indent=2))
    else:
        # Markdown output
        for t in transcripts:
            print(f"---")
            print(f"title: \"{t['title']}\"")
            print(f"id: {t['conversation_id']}")
            print(f"source: gemini")
            print(f"---")
            print()
            print(f"# {t['title']}")
            print()
            for turn in t["turns"]:
                role_label = "User" if turn["role"] == "user" else "Gemini"
                print(f"## {role_label}")
                print()
                print(turn["content"])
                print()
            print()


if __name__ == "__main__":
    main()
