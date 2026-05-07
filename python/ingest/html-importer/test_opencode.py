from bs4 import BeautifulSoup
import sys

with open("c:/dev/nexus/python/ingest/html-importer/samples/OpenCode TypeSpec Refactor.html", "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

turns = soup.find_all(attrs={"data-component": "session-turn"})
print(f"Found {len(turns)} session-turns")

for i, turn in enumerate(turns):
    user_msg = turn.find(attrs={"data-component": "user-message"})
    if user_msg:
        print(f"Turn {i} -> User: {user_msg.get_text()[:50].strip()}")
    
    agent_msg = turn.find(attrs={"data-component": "agent-message"})
    if agent_msg:
        print(f"Turn {i} -> Agent: {agent_msg.get_text()[:50].strip()}")
        continue
    
    # Try other selectors for assistant
    for div in turn.find_all("div"):
        if "data-slot" in div.attrs and "assistant" in div["data-slot"]:
            pass # we know session-turn-assistant-content exists
    
    # Text part
    text_parts = turn.find_all(attrs={"data-component": "text-part"})
    if text_parts:
        print(f"Turn {i} -> text-parts: {len(text_parts)}")
        for tp in text_parts:
            print(f"   text: {tp.get_text()[:50].strip()}")
