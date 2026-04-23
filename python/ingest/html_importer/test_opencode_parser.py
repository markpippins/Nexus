from pathlib import Path
from bs4 import BeautifulSoup
from parsers.opencode_parser import OpenCodeParser
from models import ConversationMetadata

sample_path = Path("c:/dev/nexus/python/ingest/html_importer/samples/OpenCode TypeSpec Refactor.html")
with open(sample_path, "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

parser = OpenCodeParser()
can_handle = parser.can_handle(soup, sample_path)
print(f"Can handle: {can_handle}")

meta = parser.extract_metadata(soup, sample_path)
print(f"Metadata: title='{meta.title}', id='{meta.conversation_id}'")

messages = parser.parse(soup, sample_path, meta)
print(f"Parsed {len(messages)} messages.")
for m in messages[:4]: # print first 4 to avoid unicode errors
    print(f"[{m.speaker}] (turn {m.turn_index}): {m.text[:60]!r}")
