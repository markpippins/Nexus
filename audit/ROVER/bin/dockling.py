#!/usr/bin/env python3
"""Dockling v0.3 — converts chat HTML exports to DockLang canonical IR.

Schema per DAL spec:
  discourse_units[]:
    heading: str
    body: str (full text aggregated)
    provenance: { turn_index, role, offset_start, offset_end }
    blocks[]:
      type: paragraph | code | diagram | list | quote | separator
      content: str
      language: str (for code)
      format: str (for diagram: ascii | mermaid)
      provenance: { block_index }
"""

import json, sys, re
from bs4 import BeautifulSoup, Tag

MERMAID_KEYWORDS = {'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
    'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt', 'pie',
    'journey', 'mindmap', 'timeline', 'quadrantChart', 'gitgraph',
    'xychart', 'block', 'packet', 'info', 'show', 'requirementDiagram'}

ASCII_DIAGRAM_PATTERNS = [
    re.compile(r'[│└├┌┐┘┴┬├─┼╔╗╚╝║═╠╣╦╩╬]'),  # box-drawing chars
    re.compile(r'^[\s]*[A-Za-z]+\s*[│└├┌┐┘┴┬├─┼╔╗╚╝║═].*[\s]*[A-Za-z]'),
    re.compile(r'^[\s]*[A-Za-z_.]+\s*[-←→↔↑↓↕]+.*[-←→↔↑↓↕]'),  # arrows
]


def clean_html_text(text):
    text = text.replace('\xa0', ' ')
    text = re.sub(r'  +', ' ', text)
    return text.strip()


def _extract_list_items(list_tag, depth=0):
    """Recursively extract items from a <ul> or <ol> element.

    Returns (flat_items, markdown_lines) where:
      - flat_items is a flat list of all item texts (for backward compat)
      - markdown_lines is a list of markdown-formatted lines with indentation
    """
    prefix = '  ' * depth
    is_ordered = list_tag.name == 'ol'
    flat_items = []
    md_lines = []

    for i, li in enumerate(list_tag.find_all('li', recursive=False)):
        # Check for a nested list inside this li
        nested_list = li.find(['ul', 'ol'], recursive=False)

        # Extract the li's own text content (excluding the nested list)
        if nested_list:
            # Build text from everything except the nested list
            li_text_parts = []
            for content in li.children:
                if isinstance(content, Tag) and content.name in ('ul', 'ol'):
                    continue
                if isinstance(content, Tag):
                    li_text_parts.append(content.get_text(' ', strip=True))
                elif isinstance(content, str):
                    txt = content.strip()
                    if txt:
                        li_text_parts.append(txt)
            li_text = ' '.join(li_text_parts)
            li_text = clean_html_text(li_text)
        else:
            li_text = clean_html_text(li.get_text('\n', strip=True))

        if not li_text and not nested_list:
            continue

        if li_text:
            flat_items.append(li_text)

            # Format with appropriate prefix
            if is_ordered:
                item_prefix = f"{prefix}{i + 1}. "
            else:
                item_prefix = f"{prefix}- "
            md_lines.append(item_prefix + li_text)

        # Recurse into nested list
        if nested_list:
            sub_flat, sub_md = _extract_list_items(nested_list, depth + 1)
            flat_items.extend(sub_flat)
            md_lines.extend(sub_md)

    return flat_items, md_lines


def extract_code_text(code_tag):
    lines = []
    for span in code_tag.find_all('span', recursive=True):
        line = span.get_text('\n', strip=False)
        lines.append(line)
    text = '\n'.join(lines)
    text = text.replace('\u2193', '↓').replace('\u2500', '─')\
               .replace('\u2514', '└').replace('\u251c', '├')\
               .replace('\u2502', '│')
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return text


def classify_block_type(content, raw_text):
    """Determine if a code/pre block is code, diagram (ascii/mermaid), or list."""
    first_line = content.strip().split('\n')[0].strip()

    if any(content.startswith(k) for k in MERMAID_KEYWORDS):
        return 'diagram', 'mermaid'

    # Check for ASCII diagram patterns
    lines = content.split('\n')
    box_char_count = sum(1 for l in lines if ASCII_DIAGRAM_PATTERNS[0].search(l))
    if box_char_count >= 2 and box_char_count / max(len(lines), 1) >= 0.2:
        return 'diagram', 'ascii'

    arrow_count = sum(1 for l in lines if ASCII_DIAGRAM_PATTERNS[2].search(l))
    if arrow_count >= 2 and arrow_count / max(len(lines), 1) >= 0.2:
        return 'diagram', 'ascii'

    return 'code', ''


def extract_div_blocks(div, seen_code):
    blocks = []
    for child in div.children:
        if not isinstance(child, Tag):
            continue
        result = extract_block_from_child(child, seen_code)
        if result is None:
            continue
        if isinstance(result, list):
            for rb in result:
                if rb is not None:
                    blocks.append(rb)
        else:
            blocks.append(result)
    return blocks


def extract_block_from_child(child, seen_code):
    if not isinstance(child, Tag):
        return None
    if child.name == 'hr':
        return {'type': 'separator'}
    if child.name == 'blockquote':
        text = clean_html_text(child.get_text('\n', strip=True))
        if text:
            return {'type': 'quote', 'content': text}
        return None
    if child.name == 'pre' and child.find('code'):
        code_text = extract_code_text(child.find('code'))
        if code_text:
            sig = code_text.strip()
            if sig in seen_code:
                return None
            seen_code.add(sig)
            raw_first = child.get_text('\n', strip=True)[:60].lower()
            btype, bfmt = classify_block_type(code_text, raw_first)
            result = {'type': btype, 'content': code_text}
            if btype == 'code' and bfmt:
                result['language'] = bfmt
            if btype == 'diagram':
                result['format'] = bfmt
            return result
        return None
    if child.name == 'p':
        text = clean_html_text(child.get_text('\n', strip=False))
        if text:
            return {'type': 'paragraph', 'content': text}
        return None
    if child.name in ('ul', 'ol'):
        items, md_lines = _extract_list_items(child)
        if items:
            return {'type': 'list', 'items': items, 'content': '\n'.join(md_lines)}
        return None
    if child.name == 'div':
        inner = extract_div_blocks(child, seen_code)
        if inner:
            return inner  # returns list
        return None
    return None


def extract_content_blocks(turn_element):
    seen_code = set()

    # User messages: simple pre-wrapped text
    # Check if turn_element itself is whitespace-pre-wrap, or find a child
    el_classes = turn_element.get('class', []) if hasattr(turn_element, 'get') else []
    is_user_text = 'whitespace-pre-wrap' in str(el_classes)
    user_text_div = turn_element if is_user_text else turn_element.find('div',
        class_=lambda c: c and 'whitespace-pre-wrap' in str(c))
    if user_text_div and not turn_element.find('p', attrs={'data-start': True}):
        text = clean_html_text(user_text_div.get_text('\n', strip=False))
        if text:
            return [{'type': 'paragraph', 'content': text}]

    blocks = []
    for child in turn_element.children:
        result = extract_block_from_child(child, seen_code)
        if result is None:
            continue
        if isinstance(result, list):
            for rb in result:
                if rb is not None:
                    blocks.append(rb)
        else:
            blocks.append(result)

    return merge_blocks(blocks)


def merge_blocks(blocks):
    merged = []
    for b in blocks:
        if b is None:
            continue
        if merged and b['type'] == 'paragraph' and merged[-1]['type'] == 'paragraph':
            merged[-1]['content'] += '\n' + b['content']
        else:
            merged.append(b)
    final = []
    seen_code = set()
    for b in merged:
        if b['type'] in ('code', 'diagram'):
            sig = b['content'].strip()
            if sig in seen_code:
                continue
            seen_code.add(sig)
        final.append(b)
    return final


def build_discourse_units(turns):
    """Build Discourse Units from turns. Each turn becomes a DU."""
    units = []
    for turn_idx, turn in enumerate(turns):
        blocks = turn['blocks']
        role = turn['role']
        # Build heading from role
        heading = f"Turn {turn_idx + 1} — {role}"
        # Build body: full text aggregated
        body_parts = []
        for b in blocks:
            if b['type'] == 'paragraph':
                body_parts.append(b['content'])
            elif b['type'] == 'quote':
                body_parts.append(f'> {b["content"]}')
            elif b['type'] == 'list':
                for item in b.get('items', []):
                    body_parts.append(f'- {item}')
            elif b['type'] == 'code':
                body_parts.append(f'```\n{b["content"]}\n```')
            elif b['type'] == 'diagram':
                body_parts.append(f'```{b.get("format","")}\n{b["content"]}\n```')
        body = '\n'.join(body_parts)

        # Add provenance to each block
        for bi, b in enumerate(blocks):
            b['provenance'] = {'block_index': bi}

        units.append({
            'heading': heading,
            'body': body,
            'provenance': {
                'turn_index': turn_idx,
                'role': role,
                'block_count': len(blocks)
            },
            'blocks': blocks
        })
    return units


def _detect_format(soup):
    """Detect chat export format: 'chatgpt', 'claude', or 'unknown'."""
    if soup.find_all(attrs={'data-message-author-role': True}):
        return 'chatgpt'
    if soup.find_all(attrs={'role': 'article'}):
        return 'claude'
    return 'unknown'


def _parse_claude_ai(soup):
    """Parse Claude.ai / Copilot SPA exports. Messages are in role='article' elements."""
    articles = soup.find_all(attrs={'role': 'article'})
    turns = []

    for article in articles:
        # Determine role from text prefix (Claude, Copilot, etc.)
        # Some use colon ("You said:"), some use space ("You said ")
        raw_text = article.get_text(' ', strip=True)
        if raw_text.startswith('You said'):
            role = 'user'
        elif any(raw_text.startswith(p) for p in [
            'Claude responded', 'Copilot said', 'ChatGPT said',
            'Gemini said', 'Assistant:'
        ]):
            role = 'assistant'
        else:
            continue

        # Find the content div — try multiple class patterns
        content_div = article.find('div', class_=lambda c: c and any(
            x in c for x in [
                'font-claude-response', 'font-user-message',
                'font-large', 'whitespace-pre-wrap'
            ]
        ))
        if not content_div:
            # Fallback: use the article itself
            content_div = article

        blocks = extract_content_blocks(content_div)
        if blocks:
            turns.append({'role': role, 'blocks': blocks})

    return turns


def parse_html(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'lxml')

    title_tag = soup.find('title')
    title = title_tag.get_text(strip=True) if title_tag else ''

    fmt = _detect_format(soup)

    if fmt == 'chatgpt':
        conv_match = re.search(r'chatgpt\.com/c/([^"\' ]+)', str(soup))
        conv_id = conv_match.group(1) if conv_match else ''
        turns = []
        for el in soup.find_all(attrs={'data-message-author-role': True}):
            role = el.get('data-message-author-role')
            blocks = extract_content_blocks(el)
            if blocks:
                turns.append({'role': role, 'blocks': blocks})
    elif fmt == 'claude':
        # Claude.ai conversation ID from URL or page content
        conv_match = re.search(r'claude\.ai/chat/([^"\' ]+)', str(soup))
        conv_id = conv_match.group(1) if conv_match else ''
        turns = _parse_claude_ai(soup)
    else:
        conv_id = ''
        turns = []

    units = build_discourse_units(turns)

    docklang = {
        'meta': {
            'format': 'docklang/v0.3',
            'title': title,
            'provenance': {
                'source': filepath,
                'conversation_id': conv_id
            }
        },
        'discourse_units': units,
        'stats': {
            'total_units': len(units),
            'total_blocks': sum(len(u['blocks']) for u in units),
            'by_type': {}
        }
    }

    type_counts = {}
    for u in units:
        for b in u['blocks']:
            t = b['type']
            if t == 'diagram':
                fmt_key = b.get('format', 'unknown')
                key = f'diagram:{fmt_key}'
            else:
                key = t
            type_counts[key] = type_counts.get(key, 0) + 1
    docklang['stats']['by_type'] = type_counts

    return docklang


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: dockling.py <chat.html> [output.json]', file=sys.stderr)
        sys.exit(1)

    result = parse_html(sys.argv[1])
    output = json.dumps(result, indent=2, ensure_ascii=False)

    if len(sys.argv) >= 3:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(output)
        s = result['stats']
        print(f'Wrote {sys.argv[2]} ({len(output)} bytes, {s["total_units"]} units, {s["total_blocks"]} blocks)')
        for t, c in sorted(s['by_type'].items()):
            print(f'  {t}: {c}')
    else:
        print(output)
