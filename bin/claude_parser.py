#!/usr/bin/env python3
"""
Claude HTML Parser
==================
Parses Claude.ai browser-saved HTML transcripts into the docklang conversation
format. Extracts title, conversation UUID, URL, and alternating user/Claude
message turns.

Usage:
    python3 claude_parser.py <file.html>
    python3 claude_parser.py --test <file.html>

Claude HTML structure:
    - <title> tag → conversation title
    - HTML comment: saved from url=(NNN)<claude_url> → conversation UUID
    - div[data-testid="transcript-row"] → each message row
        - div[data-testid="user-message"] → user turn (p.whitespace-pre-wrap)
        - div.standard-markdown → Claude turn (p.font-claude-response-body)
        - button[data-testid="tool-status-pill"] → tool use (within Claude rows)
"""

import json
import re
import sys
from pathlib import Path

try:
    from bs4 import BeautifulSoup, NavigableString
except ImportError:
    print("ERROR: beautifulsoup4 not installed. Run: pip install beautifulsoup4 lxml", file=sys.stderr)
    sys.exit(1)


def _clean_text(text: str) -> str:
    """Normalize whitespace: collapse runs, strip."""
    return re.sub(r'\s+', ' ', text).strip()


def _extract_element_text(element) -> str:
    """Extract text from a message element, preserving inline formatting."""
    if element is None:
        return ""
    
    parts = []
    for child in element.children:
        if isinstance(child, NavigableString):
            t = child.strip()
            if t:
                parts.append(t)
        elif child.name == 'code':
            parts.append(f"`{child.get_text()}`")
        elif child.name == 'strong' or child.name == 'b':
            parts.append(f"**{child.get_text()}**")
        elif child.name == 'em' or child.name == 'i':
            parts.append(f"*{child.get_text()}*")
        elif child.name == 'a':
            href = child.get('href', '')
            text = child.get_text()
            if href and text:
                parts.append(f"[{text}]({href})")
            elif text:
                parts.append(text)
        elif child.name == 'p':
            # Nested <p> inside a message paragraph (e.g., code blocks)
            parts.append(child.get_text(strip=True))
        elif child.name == 'ul' or child.name == 'ol':
            for li in child.find_all('li', recursive=False):
                parts.append(f"- {li.get_text(strip=True)}")
        elif child.name == 'pre':
            parts.append(f"```\n{child.get_text()}\n```")
        elif child.name == 'div':
            # Could be a code block container
            pre = child.find('pre')
            if pre:
                parts.append(f"```\n{pre.get_text()}\n```")
            else:
                t = child.get_text(strip=True)
                if t:
                    parts.append(t)
        else:
            t = child.get_text(strip=True)
            if t:
                parts.append(t)
    
    return '\n'.join(parts)


def _extract_claude_turn(container) -> str:
    """Extract all text and tool calls from a Claude response container."""
    parts = []
    
    # Find all standard-markdown sections
    md_sections = container.find_all('div', class_='standard-markdown')
    for section in md_sections:
        # Collect paragraphs
        for p in section.find_all('p'):
            text = _extract_element_text(p)
            if text:
                parts.append(text)
        
        # Collect code blocks
        for pre in section.find_all('pre'):
            code = pre.get_text()
            if code.strip():
                parts.append(f"```\n{code.strip()}\n```")
    
    # If no standard-markdown found, try font-claude-response-body paragraphs
    if not parts:
        for p in container.find_all('p', class_='font-claude-response-body'):
            text = _extract_element_text(p)
            if text:
                parts.append(text)
    
    # Collect tool use pills
    tool_pills = container.find_all('button', attrs={'data-testid': 'tool-status-pill'})
    for pill in tool_pills:
        tool_text = pill.get_text(strip=True)
        if tool_text:
            parts.append(f"[Tool: {tool_text}]")
    
    return '\n\n'.join(parts)


def parse_claude_html(filepath: str) -> dict:
    """
    Parse a Claude.ai browser-saved HTML file.
    
    Returns:
        dict with keys:
            title: conversation title
            conversation_id: UUID from URL
            url: Claude chat URL
            source_file: input filename
            source_format: "claude_html"
            turns: list of {"role": "user"|"assistant", "content": str}
    """
    path = Path(filepath)
    html = path.read_text(encoding='utf-8', errors='replace')
    soup = BeautifulSoup(html, 'html.parser')
    
    # --- Title ---
    title_tag = soup.find('title')
    title = title_tag.get_text(strip=True) if title_tag else path.stem
    # Remove " - Claude" suffix if present
    title = re.sub(r'\s*-\s*Claude\s*$', '', title)
    
    # --- URL and conversation UUID ---
    claude_url = None
    conversation_id = None
    
    # Look for "saved from url" comment at the start
    html_str = str(soup)[:1000]
    url_match = re.search(r'saved from url=\(\d+\)(https?://claude\.ai/chat/([a-f0-9-]+))', html_str)
    if url_match:
        claude_url = url_match.group(1)
        conversation_id = url_match.group(2)
    
    # --- Walk transcript rows ---
    rows = soup.find_all('div', attrs={'data-testid': 'transcript-row'})
    turns = []
    
    for row in rows:
        # User message?
        user_msg = row.find(attrs={'data-testid': 'user-message'})
        if user_msg:
            # Collect all whitespace-pre-wrap paragraphs
            text_parts = []
            for p in user_msg.find_all('p', class_='whitespace-pre-wrap'):
                text = _extract_element_text(p)
                if text:
                    text_parts.append(text)
            content = '\n\n'.join(text_parts)
            if content.strip():
                turns.append({"role": "user", "content": content.strip()})
            continue
        
        # Claude response (standard-markdown or tool-only row)?
        md = row.find(class_='standard-markdown')
        tools = row.find_all('button', attrs={'data-testid': 'tool-status-pill'})
        
        if md or tools:
            content = _extract_claude_turn(row)
            if content.strip():
                turns.append({"role": "assistant", "content": content.strip()})
            continue
        
        # Could be a tool-only row with no markdown (collapsed tool calls)
        # Check for tool status pills anywhere in the row
        all_tools = row.find_all('button', attrs={'data-testid': 'tool-status-pill'})
        if all_tools:
            tool_texts = [t.get_text(strip=True) for t in all_tools if t.get_text(strip=True)]
            if tool_texts:
                content = '\n'.join(f"[Tool: {tt}]" for tt in tool_texts)
                turns.append({"role": "assistant", "content": content})
    
    return {
        "title": title,
        "conversation_id": conversation_id,
        "url": claude_url,
        "source_file": path.name,
        "source_format": "claude_html",
        "turns": turns,
    }


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} [--test] <claude.html>", file=sys.stderr)
        sys.exit(1)
    
    test_mode = '--test' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--test']
    
    if not args:
        print("ERROR: No file specified", file=sys.stderr)
        sys.exit(1)
    
    filepath = args[0]
    
    try:
        result = parse_claude_html(filepath)
    except Exception as e:
        print(f"ERROR parsing {filepath}: {e}", file=sys.stderr)
        sys.exit(1)
    
    if test_mode:
        print(f"Title: {result['title']}")
        print(f"Conversation ID: {result['conversation_id']}")
        print(f"URL: {result['url']}")
        print(f"Turns: {len(result['turns'])}")
        for i, turn in enumerate(result['turns']):
            role = turn['role']
            content = turn['content'][:120].replace('\n', '\\n')
            print(f"  [{i}] {role}: {content}...")
        print()
        print("Full JSON:")
        print(json.dumps(result, indent=2, ensure_ascii=False)[:2000])
    else:
        print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
