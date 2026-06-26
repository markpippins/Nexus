#!/usr/bin/env python3
"""Extract full conversation text from the ChatGPT HTML export."""
import sys
from bs4 import BeautifulSoup

path = "/home/codex/dev/chats/Event-Driven CLI Agents.html"
html = open(path).read()
soup = BeautifulSoup(html, "html.parser")

# Remove script/style elements
for tag in soup(["script", "style", "noscript", "meta", "link"]):
    tag.decompose()

# Extract all text from main content areas
# The conversation is in divs with turn-messages classes
turns = soup.find_all("div", class_=lambda c: c and "turn-messages" in c)

if not turns:
    # Fallback: extract all meaningful text
    texts = []
    for el in soup.find_all(["p", "li", "pre", "blockquote", "h1", "h2", "h3", "h4"]):
        # Skip elements inside script/style
        if el.find_parent(["script", "style"]):
            continue
        tag = el.name
        text = el.get_text(strip=True)
        if not text:
            continue
        if tag.startswith("h"):
            level = tag[1]
            texts.append(f"\n{'#' * int(level)} {text}\n")
        elif tag == "pre":
            code = el.find("code")
            if code:
                texts.append(f"```\n{code.get_text()}\n```")
            else:
                texts.append(f"```\n{el.get_text()}\n```")
        elif tag == "blockquote":
            texts.append(f"> {text}")
        elif tag == "li":
            texts.append(f"  - {text}")
        else:
            texts.append(text)
    print("\n\n".join(texts))
else:
    for turn in turns:
        print(turn.get_text(strip=True))
        print("---TURN BREAK---")
