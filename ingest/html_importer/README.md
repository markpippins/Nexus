# HTML & Markdown Chat Transcript Importer

Extracts individual messages from saved HTML and Markdown chat transcripts and
normalizes them into a consistent format.

## Supported sources

| Source | Status |
|---|---|
| ChatGPT (including custom GPTs) | ✅ |
| Microsoft Copilot | ✅ |
| Markdown chat exports | ✅ (heuristic — catches short acknowledgments) |
| Google Gemini | Stub — awaiting a real Gemini chat export sample |
| Google Search AI mode | Stub — awaiting parser implementation |

Adding a new source requires only a single subclass — see **Extending** below.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Or just run `main.py` directly — it auto-installs dependencies on first use.

## Usage

### Console output (human-readable, truncated for display)

```bash
python main.py path/to/chat.html
python main.py path/to/conversation.md
python main.py path/to/folder/
```

Each `NormalizedMessage` is printed with text and CSS selector refs truncated to ~120 chars. Full data is always available via `msg.text`, `msg.raw_html_ref`, and `msg.to_dict()`.

### JSON output (complete, machine-readable)

```bash
# JSON to stdout
python main.py path/to/folder/ --json

# JSON to file (status messages go to stderr)
python main.py path/to/folder/ --json -o output.json
```

The JSON output includes all messages with full text, full HTML refs, metadata, and timestamp provenance.

## Data model

### NormalizedMessage

```python
NormalizedMessage {
    message_id: str          # Unique ID from source HTML (or CSS selector fallback)
    speaker: str             # "user" or "assistant"
    timestamp: TimestampInfo # See below
    text: str                # Full extracted message text
    turn_index: int          # 0-based turn (user + assistant share same turn)
    raw_html_ref: str        # CSS selector path for traceability
}
```

### TimestampInfo

```python
TimestampInfo {
    value: str | None        # ISO 8601 timestamp, or None
    confidence: "high"       # Found in DOM on the message element
                | "medium"   # Found in embedded JSON (e.g. create_time)
                | "low"      # Derived from file modification time
                | "none"     # Not available
    source: "dom" | "embedded_json" | "file_metadata" | "synthetic"
    raw_value: str | None    # Original unmodified value, if any
}
```

### ConversationMetadata (extracted once per file)

```python
ConversationMetadata {
    conversation_id: str | None
    title: str | None
    create_time: str | None
    update_time: str | None
    model: str | None          # e.g. "gpt-5-mini", "gpt-5-3"
    export_source: str | None  # e.g. "ChatGPT", "Microsoft Copilot"
}
```

## Output examples

### Console
```
--------------------------------------------------------------------------------
[Turn 0] user (2026-04-10T02:06:50+00:00 (low, from file_metadata))
  ID: d7f5ec8b-7d71-4440-9925-c115f90c23da
  Ref: #main > #thread > div > ...
  Text: Theo Browne topday: 0:00Back in my day, the kids used to have to...
```

### JSON
```json
{
  "files": [
    {
      "file": "samples/Nexus - AI Tooling Evolution.html",
      "metadata": {
        "conversation_id": "69d51b4d-6da0-8328-9a5c-de7123c43c36",
        "title": "Nexus - AI Tooling Evolution",
        "create_time": "2026-04-10T02:06:50.623072+00:00",
        "update_time": null,
        "model": "gpt-5-3",
        "export_source": "ChatGPT"
      },
      "messages": [
        {
          "message_id": "d7f5ec8b-7d71-4440-9925-c115f90c23da",
          "speaker": "user",
          "timestamp": {
            "value": "2026-04-10T02:06:50.623072+00:00",
            "confidence": "low",
            "source": "file_metadata",
            "raw_value": "2026-04-10T02:06:50.623072+00:00"
          },
          "text": "...",
          "turn_index": 0,
          "raw_html_ref": "..."
        }
      ]
    }
  ]
}
```

## Extending — adding a new source

1. Create a new file in `parsers/` (e.g. `parsers/claude_parser.py`):

```python
from pathlib import Path
from bs4 import BeautifulSoup

from models import NormalizedMessage, ConversationMetadata
from base_parser import BaseParser, register_parser


@register_parser
class ClaudeParser(BaseParser):

    @property
    def source_name(self) -> str:
        return "Claude"

    def can_handle(self, soup: BeautifulSoup, source_path: Path) -> bool:
        return soup.find(class_="claude-message") is not None

    def extract_metadata(self, soup: BeautifulSoup, source_path: Path) -> ConversationMetadata:
        # Extract title, conversation_id, model, timestamps, etc.
        return ConversationMetadata(title="...")

    def parse(self, soup: BeautifulSoup, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        # Extract messages and return as list[NormalizedMessage]
        ...
```

2. Import it in `parsers/__init__.py`:

```python
from parsers.claude_parser import ClaudeParser  # noqa: F401
```

The `@register_parser` decorator handles discovery automatically — no changes needed to `main.py`.

## Project structure

```
html_importer/
├── main.py               # CLI entry point
├── models.py             # NormalizedMessage, TimestampInfo, ConversationMetadata
├── base_parser.py        # Strategy pattern (BaseParser + registry)
├── parsers/
│   ├── __init__.py
│   ├── chatgpt_parser.py # ChatGPT parser
│   ├── copilot_parser.py # Microsoft Copilot parser
│   ├── gemini_parser.py  # Stub (awaiting real sample)
│   └── markdown_parser.py # Markdown chat heuristic parser
├── requirements.txt
└── samples/              # Sample HTML and Markdown exports
```

## Notes

- Files inside `*_files/` subdirectories (browser "Save Page As" artifacts) are automatically skipped.
- Timestamps in ChatGPT and Copilot exports are not embedded in the HTML — the importer falls back to the file modification time with `confidence: "low"`.
- Markdown chat classification is heuristic-based (very short unformatted paragraphs = user). It reliably catches brief acknowledgments like "Sure." and "alright" but may misclassify short assistant paragraphs.
- Gemini sample in `/samples` is currently a Google Search results page, not an actual Gemini chat transcript.
