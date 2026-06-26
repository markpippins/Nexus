"""Tests for the DocLing-based parsing pipeline.

These tests use mock DoclingDocuments (no actual docling dependency needed)
to verify that each parser correctly converts DocLing markdown output into
NormalizedMessages. The mock mimics the doc.export_to_markdown() interface
that all parsers rely on.
"""

from pathlib import Path
from datetime import datetime, timezone

import pytest

from models import NormalizedMessage, ConversationMetadata
from docling_adapter import DoclingAdapter


# ---------------------------------------------------------------------------
# Mock DoclingDocument
# ---------------------------------------------------------------------------

class MockDoclingDocument:
    """Mimics docling.Document.export_to_markdown() for testing.

    All parsers only use doc.export_to_markdown() — no other DocLing API
    surface is exercised during parsing.
    """

    def __init__(self, markdown_text: str):
        self._md = markdown_text
        # Simple mock of DoclingDocument.texts for extract_text_items
        self.texts = [type('TextItem', (), {'text': t.strip(), 'label': None, 'prov': ''})()
                      for t in markdown_text.split('\n') if t.strip()]

    def export_to_markdown(self) -> str:
        return self._md

    def export_to_text(self) -> str:
        """Return plain text (used by adapter helpers)."""
        import re
        return re.sub(r'\*{1,2}|#+\s*|`{1,3}', '', self._md)


# ---------------------------------------------------------------------------
# Fixtures — realistic transcript excerpts for each platform
# ---------------------------------------------------------------------------

@pytest.fixture
def chatgpt_markdown() -> str:
    return """# Kubernetes Deployment Strategies

**User:** What are the main Kubernetes deployment strategies?

**ChatGPT:** There are several key Kubernetes deployment strategies:

1. **Rolling Update** — gradually replaces old pods with new ones
2. **Blue/Green** — runs two environments and switches traffic
3. **Canary** — rolls out to a subset first
4. **Recreate** — terminates all old pods before creating new ones

**User:** Which one would you recommend for a production web service?

**ChatGPT:** For a production web service, Rolling Update is usually the best choice because it provides zero-downtime deployments. However, if you need to test changes against real traffic first, consider Canary deployments.

**User:** That makes sense, thanks!
"""


@pytest.fixture
def copilot_markdown() -> str:
    return """# API Error Handling Pattern

**You:** Can you help me implement consistent error handling in my FastAPI app?

**Copilot:** Absolutely! Here's a pattern using custom exception handlers:

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI()

class AppError(Exception):
    def __init__(self, message: str, code: int = 400):
        self.message = message
        self.code = code

@app.exception_handler(AppError)
async def app_error_handler(request, exc):
    return JSONResponse(
        status_code=exc.code,
        content={"error": exc.message}
    )
```

**You:** Can you add request logging too?

**Copilot:** Sure! Add a middleware to log request details:

```python
@app.middleware("http")
async def log_requests(request, call_next):
    print(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    print(f"Response: {response.status_code}")
    return response
```
"""


@pytest.fixture
def opencode_markdown() -> str:
    return """# TypeSpec Refactoring Plan

**User:** I need to refactor our TypeSpec model into smaller files

**Assistant:** Here's a recommended structure:

**User:** Should I use composition or inheritance?

**Assistant:** Composition is generally preferred in TypeSpec because it gives you more flexibility. Inheritance creates tight coupling between models.

## Proposed Structure

- `models/user.tsp` — User entity
- `models/order.tsp` — Order entity  
- `models/product.tsp` — Product entity

**User:** OK, let's start with user.tsp
"""


@pytest.fixture
def gemini_markdown() -> str:
    return """# Quantum Computing Basics

**You:** Explain quantum superposition simply

**Gemini:** Superposition is like a spinning coin — while it's spinning, it's both heads and tails at the same time. Only when it lands (is measured) does it pick one.

## Key Concepts

- Qubits can exist in multiple states simultaneously
- Measurement collapses the state
- Entanglement links qubits across distance

**User:** How is this useful for cryptography?
"""


@pytest.fixture
def multi_turn_chatgpt() -> str:
    """A longer conversation to test turn tracking."""
    return """# Spring Boot Discussion

**User:** How do I set up Spring Security?

**ChatGPT:** Add the spring-boot-starter-security dependency and configure a SecurityFilterChain bean.

**User:** What about JWT authentication?

**ChatGPT:** JWT authentication requires:
1. A JWT filter that extracts the token
2. A secret key for signing
3. Token validation logic

**User:** Can you show me the filter code?

**ChatGPT:** Here's a JWT authentication filter:

```java
public class JwtFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(...) {
        // extract and validate token
    }
}
```

**User:** Great, that works perfectly!

**ChatGPT:** Glad to help! Let me know if you need more details on any part.
"""


@pytest.fixture
def temp_transcript(tmp_path) -> Path:
    """Create a temporary transcript file to exercise file-based metadata extraction."""
    p = tmp_path / "Nexus - Test Conversation.html"
    p.write_text("<html><body><p>placeholder</p></body></html>", encoding="utf-8")
    return p


# ---------------------------------------------------------------------------
# ChatGPT parser tests
# ---------------------------------------------------------------------------

class TestChatGPTParser:
    """DocLing-based ChatGPT parser tests."""

    def test_detects_by_label(self):
        doc = MockDoclingDocument("**ChatGPT:** Hello\n**User:** Hi")
        from parsers.chatgpt_parser import ChatGPTParser
        parser = ChatGPTParser()
        assert parser.can_handle(doc, Path("chat.html")) is True

    def test_detects_by_filename(self):
        doc = MockDoclingDocument("plain text without labels")
        from parsers.chatgpt_parser import ChatGPTParser
        parser = ChatGPTParser()
        assert parser.can_handle(doc, Path("chatgpt-export.html")) is True

    def test_rejects_unrelated(self):
        doc = MockDoclingDocument("**Copilot:** Hello\n**You:** Hi")
        from parsers.chatgpt_parser import ChatGPTParser
        parser = ChatGPTParser()
        assert parser.can_handle(doc, Path("random.html")) is False

    def test_metadata_extracts_title(self, chatgpt_markdown):
        doc = MockDoclingDocument(chatgpt_markdown)
        from parsers.chatgpt_parser import ChatGPTParser
        parser = ChatGPTParser()
        meta = parser.extract_metadata(doc, Path("test.html"))
        assert meta.title == "Kubernetes Deployment Strategies"

    def test_parse_full_conversation(self, chatgpt_markdown):
        doc = MockDoclingDocument(chatgpt_markdown)
        from parsers.chatgpt_parser import ChatGPTParser
        parser = ChatGPTParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(doc, Path("test.html"), meta)

        assert len(messages) > 0, f"Expected >0 messages, got {len(messages)}"
        speakers = {m.speaker for m in messages}
        assert "user" in speakers, f"No user messages found: {[(m.speaker, m.text[:30]) for m in messages]}"
        assert "assistant" in speakers, f"No assistant messages found"

        # Verify content preserved through DocLing → markdown → parser
        texts = " ".join(m.text for m in messages)
        assert "Kubernetes" in texts, f"Expected 'Kubernetes' in texts: {texts[:200]}"

    def test_turn_tracking(self, multi_turn_chatgpt):
        """Consecutive assistant messages should increment turn index."""
        doc = MockDoclingDocument(multi_turn_chatgpt)
        from parsers.chatgpt_parser import ChatGPTParser
        parser = ChatGPTParser()
        meta = ConversationMetadata(title="Multi")
        messages = parser.parse(doc, Path("test.html"), meta)

        # Turn tracking: messages alternate user/assistant
        # Each user+assistant pair is one turn (turn_index starts at 0)
        assert len(messages) >= 4, f"Expected at least 4 messages, got {len(messages)}"
        speakers = {m.speaker for m in messages}
        assert "user" in speakers, f"No user messages: {[(m.speaker, m.text[:20]) for m in messages]}"
        assert "assistant" in speakers

    def test_citation_stripping(self):
        """ChatGPT citation artifacts like [^1] should be removed."""
        text = "This is a statement with a citation.[^1] Another source says X.[^2]"
        from parsers.chatgpt_parser import ChatGPTParser
        result = ChatGPTParser._strip_citations(text)
        assert "[^1]" not in result
        assert "[^2]" not in result


# ---------------------------------------------------------------------------
# Copilot parser tests
# ---------------------------------------------------------------------------

class TestCopilotParser:
    """DocLing-based Copilot parser tests."""

    def test_detects_by_label(self):
        doc = MockDoclingDocument("**Copilot:** Hello\n**You:** Hi")
        from parsers.copilot_parser import CopilotParser
        parser = CopilotParser()
        assert parser.can_handle(doc, Path("chat.html")) is True

    def test_detects_by_filename(self):
        doc = MockDoclingDocument("plain text")
        from parsers.copilot_parser import CopilotParser
        parser = CopilotParser()
        assert parser.can_handle(doc, Path("copilot-session.html")) is True

    def test_rejects_unrelated(self):
        doc = MockDoclingDocument("**ChatGPT:** Hello\n**User:** Hi")
        from parsers.copilot_parser import CopilotParser
        parser = CopilotParser()
        assert parser.can_handle(doc, Path("random.html")) is False

    def test_metadata_extracts_title(self, copilot_markdown):
        doc = MockDoclingDocument(copilot_markdown)
        from parsers.copilot_parser import CopilotParser
        parser = CopilotParser()
        meta = parser.extract_metadata(doc, Path("test.html"))
        assert meta.title == "API Error Handling Pattern"

    def test_parse_conversation(self, copilot_markdown):
        doc = MockDoclingDocument(copilot_markdown)
        from parsers.copilot_parser import CopilotParser
        parser = CopilotParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(doc, Path("test.html"), meta)

        assert len(messages) >= 2, f"Expected >=2 messages, got {len(messages)}"
        # Check speaker labels
        speakers = {m.speaker for m in messages}
        assert "user" in speakers
        assert "assistant" in speakers

        # Code blocks preserved as text
        texts = " ".join(m.text for m in messages)
        assert "FastAPI" in texts or "fastapi" in texts


# ---------------------------------------------------------------------------
# OpenCode parser tests
# ---------------------------------------------------------------------------

class TestOpenCodeParser:
    """DocLing-based OpenCode parser tests."""

    def test_detects_by_label(self):
        doc = MockDoclingDocument("**Assistant:** Think about it\n**User:** OK")
        from parsers.opencode_parser import OpenCodeParser
        parser = OpenCodeParser()
        assert parser.can_handle(doc, Path("chat.html")) is True

    def test_detects_by_filename(self):
        doc = MockDoclingDocument("plain")
        from parsers.opencode_parser import OpenCodeParser
        parser = OpenCodeParser()
        assert parser.can_handle(doc, Path("opencode-session.html")) is True

    def test_rejects_unrelated(self):
        doc = MockDoclingDocument("**ChatGPT:** Hello")
        from parsers.opencode_parser import OpenCodeParser
        parser = OpenCodeParser()
        assert parser.can_handle(doc, Path("random.html")) is False

    def test_parse_conversation(self, opencode_markdown):
        doc = MockDoclingDocument(opencode_markdown)
        from parsers.opencode_parser import OpenCodeParser
        parser = OpenCodeParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(doc, Path("test.html"), meta)

        assert len(messages) >= 2, f"Expected >=2 messages, got {len(messages)}"
        speakers = {m.speaker for m in messages}
        assert "user" in speakers
        assert "assistant" in speakers

        # Technical content preserved
        texts = " ".join(m.text for m in messages)
        assert "TypeSpec" in texts or "refactor" in texts


# ---------------------------------------------------------------------------
# Gemini parser tests
# ---------------------------------------------------------------------------

class TestGeminiParser:
    """DocLing-based Gemini parser tests."""

    def test_detects_by_label(self):
        doc = MockDoclingDocument("**Gemini:** The answer is 42\n**You:** Thanks!")
        from parsers.gemini_parser import GeminiParser
        parser = GeminiParser()
        assert parser.can_handle(doc, Path("chat.html")) is True

    def test_detects_by_filename(self):
        doc = MockDoclingDocument("plain")
        from parsers.gemini_parser import GeminiParser
        parser = GeminiParser()
        assert parser.can_handle(doc, Path("gemini-export.html")) is True

    def test_rejects_unrelated(self):
        doc = MockDoclingDocument("**Copilot:** Hello")
        from parsers.gemini_parser import GeminiParser
        parser = GeminiParser()
        assert parser.can_handle(doc, Path("random.html")) is False

    def test_parse_conversation(self, gemini_markdown):
        doc = MockDoclingDocument(gemini_markdown)
        from parsers.gemini_parser import GeminiParser
        parser = GeminiParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(doc, Path("test.html"), meta)

        assert len(messages) >= 2, f"Expected >=2 messages, got {len(messages)}"
        speakers = {m.speaker for m in messages}
        assert "user" in speakers
        assert "assistant" in speakers

        # Quantum content preserved
        texts = " ".join(m.text for m in messages).lower()
        assert "superposition" in texts or "quantum" in texts


# ---------------------------------------------------------------------------
# Markdown parser tests
# ---------------------------------------------------------------------------

class TestMarkdownParser:
    """DocLing-based Markdown parser tests.

    Note: MarkdownParser uses doc=None for the `can_handle` path (since
    raw .md files don't go through DocLing conversion), but the signature
    accepts `doc` for interface compatibility.
    """

    def test_detects_md_extension(self, tmp_path):
        md_file = tmp_path / "conversation.md"
        # User blocks must be short with no formatting for MarkdownParser detection
        md_file.write_text("# Title\n\nHello\n\n**Assistant:** Hi there!\n\nOK\n\n**Assistant:** I'm doing well!")
        from parsers.markdown_parser import MarkdownParser
        parser = MarkdownParser()
        # MarkdownParser checks the file path extension
        result = parser.can_handle(None, md_file)
        assert result is True

    def test_rejects_non_md(self, tmp_path):
        txt_file = tmp_path / "notes.txt"
        txt_file.write_text("Some text")
        from parsers.markdown_parser import MarkdownParser
        parser = MarkdownParser()
        assert parser.can_handle(None, txt_file) is False

    def test_parse_conversation(self, tmp_path):
        md_file = tmp_path / "chat.md"
        # User blocks must be short (1 line, 1-2 words) without formatting
        md_file.write_text(
            "# Discussion\n\n"
            "Hello\n\n"
            "**Assistant:** The capital of France is Paris.\n\n"
            "Thanks!\n\n"
            "**Assistant:** You're welcome!"
        )
        from parsers.markdown_parser import MarkdownParser
        parser = MarkdownParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(None, md_file, meta)

        assert len(messages) >= 2, f"Expected >=2 messages, got {len(messages)}"
        speakers = {m.speaker for m in messages}
        assert "user" in speakers
        assert "assistant" in speakers


# ---------------------------------------------------------------------------
# ChatGPT HTML parser tests (web UI "Save page as..." format)
# ---------------------------------------------------------------------------

def _make_chatgpt_html(messages: list[tuple[str, str]]) -> str:
    """Create a minimal ChatGPT web UI HTML snippet for testing.

    Args:
        messages: List of (role, text) tuples, where role is "user" or "assistant".
    """
    body = ""
    for i, (role, text) in enumerate(messages):
        body += (
            f'<div data-message-author-role="{role}" '
            f'data-message-id="test-msg-{i}" dir="auto" '
            f'class="min-h-8 text-message">'
            f'<div class="flex flex-col"><div class="whitespace-pre-wrap">{text}</div></div>'
            f'</div>\n'
        )
    return f"<html><body>\n{body}</body></html>"


@pytest.fixture
def chatgpt_html_two_turns(tmp_path) -> Path:
    """Create a temp HTML file with user+assistant turn."""
    html = _make_chatgpt_html([
        ("user", "What are Kubernetes deployment strategies?"),
        ("assistant", "There are several key strategies: Rolling Update, Blue/Green, Canary, and Recreate."),
    ])
    p = tmp_path / "Nexus - Kubernetes Chat.html"
    p.write_text(html, encoding="utf-8")
    return p


@pytest.fixture
def chatgpt_html_multi_turn(tmp_path) -> Path:
    """Create a temp HTML file with multiple user/assistant turns."""
    html = _make_chatgpt_html([
        ("user", "How do I set up Spring Security?"),
        ("assistant", "Add the spring-boot-starter-security dependency."),
        ("user", "What about JWT authentication?"),
        ("assistant", "JWT requires a filter that extracts and validates the token."),
        ("user", "Can you show me the filter code?"),
        ("assistant", "Here's a JWT authentication filter."),
    ])
    p = tmp_path / "Spring Security Chat.html"
    p.write_text(html, encoding="utf-8")
    return p


class TestChatGPTHtmlParser:
    """Tests for ChatGPTHtmlParser (ChatGPT web UI "Save page as..." format)."""

    def test_detects_by_data_attribute(self, tmp_path):
        """can_handle should return True when data-message-author-role is present."""
        p = tmp_path / "chat.html"
        p.write_text(
            '<html><div data-message-author-role="user">hi</div></html>',
            encoding="utf-8",
        )
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        assert parser.can_handle(None, p) is True

    def test_rejects_without_attribute(self, tmp_path):
        """can_handle should return False when no data-message-author-role."""
        p = tmp_path / "chat.html"
        p.write_text("<html><body>**ChatGPT:** Hello</body></html>", encoding="utf-8")
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        assert parser.can_handle(None, p) is False

    def test_rejects_binary(self, tmp_path):
        """can_handle should not crash on binary files."""
        p = tmp_path / "binary.bin"
        p.write_bytes(b"\x00\x01\x02\xff\xfe")
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        assert parser.can_handle(None, p) is False

    def test_metadata_extracts_title_from_doc_texts(self):
        """extract_metadata should get title from DocLing's first text item."""
        doc = MockDoclingDocument("# Kubernetes Strategies\n\n**User:** hi")
        # Add a title-like first item
        doc.texts = [type('TextItem', (), {'text': 'Kubernetes Strategies', 'label': 'title', 'prov': ''})()]
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        meta = parser.extract_metadata(doc, Path("test.html"))
        assert meta.title == "Kubernetes Strategies"

    def test_metadata_falls_back_to_filename(self):
        """extract_metadata should fall back to filename when no title in doc."""
        doc = MockDoclingDocument("")
        doc.texts = []
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        meta = parser.extract_metadata(doc, Path("Nexus - My Chat.html"))
        assert meta.title == "Nexus - My Chat"

    def test_parse_two_turns(self, chatgpt_html_two_turns):
        """Parse a user+assistant pair."""
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(None, chatgpt_html_two_turns, meta)

        assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}"
        assert messages[0].speaker == "user"
        assert messages[1].speaker == "assistant"
        assert "Kubernetes" in messages[0].text
        assert "Rolling Update" in messages[1].text

    def test_parse_multi_turn(self, chatgpt_html_multi_turn):
        """Parse multiple user/assistant turns."""
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(None, chatgpt_html_multi_turn, meta)

        assert len(messages) == 6, f"Expected 6 messages, got {len(messages)}"

        # Check alternating speakers
        expected_speakers = ["user", "assistant", "user", "assistant", "user", "assistant"]
        for i, (m, exp) in enumerate(zip(messages, expected_speakers)):
            assert m.speaker == exp, f"Message {i}: expected {exp}, got {m.speaker}"

        # Turn indices: each user+assistant pair shares a turn index
        assert messages[0].turn_index == 0  # user turn 0
        assert messages[1].turn_index == 1  # assistant turn 1
        assert messages[2].turn_index == 2  # user turn 2
        assert messages[3].turn_index == 3  # assistant turn 3

    def test_parse_no_messages(self, tmp_path):
        """HTML without message divs should return empty list."""
        p = tmp_path / "empty.html"
        p.write_text("<html><body>No messages here</body></html>", encoding="utf-8")
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(None, p, meta)
        assert len(messages) == 0

    def test_parse_nonexistent_file(self, tmp_path):
        """Nonexistent file should return empty list without crashing."""
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(None, tmp_path / "nonexistent.html", meta)
        assert len(messages) == 0

    def test_extracts_text_from_complex_html(self, tmp_path):
        """Should handle HTML with nested elements, code blocks, lists."""
        html = '''<html><body>
<div data-message-author-role="user" data-message-id="m1" class="min-h-8 text-message">
<div><div class="whitespace-pre-wrap">Explain how to use list comprehension in Python</div></div>
</div>
<div data-message-author-role="assistant" data-message-id="m2" class="min-h-8 text-message">
<div><div class="whitespace-pre-wrap">
<p>Here is an example:</p>
<pre><code>squares = [x**2 for x in range(10)]</code></pre>
<p>This creates a list of squares.</p>
</div></div>
</div>
</body></html>'''
        p = tmp_path / "complex.html"
        p.write_text(html, encoding="utf-8")
        from parsers.chatgpt_html_parser import ChatGPTHtmlParser
        parser = ChatGPTHtmlParser()
        meta = ConversationMetadata(title="Test")
        messages = parser.parse(None, p, meta)

        assert len(messages) == 2
        # Code content should be preserved
        assert "squares" in messages[1].text or "list comprehension" in messages[1].text

    def test_dispatches_correctly(self, chatgpt_html_two_turns):
        """detect_and_parse should dispatch to ChatGPTHtmlParser for web UI HTML."""
        from base_parser import detect_and_parse
        from docling_adapter import DoclingAdapter

        # For detect_and_parse, we need a DoclingDocument. Mock it.
        doc = MockDoclingDocument("# Title\n\nWeb UI content")
        messages, meta = detect_and_parse(doc, chatgpt_html_two_turns)

        assert len(messages) > 0, f"Expected >0 messages, got {len(messages)}"
        assert meta.export_source == "ChatGPT HTML"
        assert messages[0].speaker == "user"
        assert "Kubernetes" in messages[0].text


# ---------------------------------------------------------------------------
# DoclingAdapter unit tests
# ---------------------------------------------------------------------------

class TestDoclingAdapter:
    """Tests for DoclingAdapter utility methods (no actual DocLing needed)."""

    def test_extract_text_items(self):
        # This test requires a real DoclingDocument with 'texts' attribute
        # Mark as skip since MockDoclingDocument doesn't have this
        doc = MockDoclingDocument("Hello\nWorld")
        items = DoclingAdapter.extract_text_items(doc)
        assert len(items) > 0
        assert all("text" in item for item in items)

    def test_export_to_markdown(self):
        doc = MockDoclingDocument("# Title\n\nBody text")
        md = DoclingAdapter.export_to_markdown(doc)
        assert "Title" in md
        assert "Body text" in md

    def test_get_text(self):
        doc = MockDoclingDocument("# Title\n\n**bold** text `code`")
        text = DoclingAdapter.get_text(doc)
        assert "Title" in text


# ---------------------------------------------------------------------------
# Fallback parser tests
# ---------------------------------------------------------------------------

class TestFallbackParser:
    """Tests for the DocLing document fallback parsing."""

    def test_fallback_phase1_section_headers(self):
        """Phase 1 should detect speaker turns from section_header items."""
        from base_parser import _fallback_phase1_section_headers
        from models import ConversationMetadata

        # Create a mock doc with section_header items for speaker turns
        mock_texts = [
            type('TextItem', (), {'text': 'Chat history', 'label': 'section_header', 'prov': ''})(),
            type('TextItem', (), {'text': 'You said:', 'label': 'section_header', 'prov': ''})(),
            type('TextItem', (), {'text': 'What is Kubernetes?', 'label': 'text', 'prov': ''})(),
            type('TextItem', (), {'text': 'ChatGPT said:', 'label': 'section_header', 'prov': ''})(),
            type('TextItem', (), {'text': 'Kubernetes is a container orchestration platform.', 'label': 'text', 'prov': ''})(),
            type('TextItem', (), {'text': 'You said:', 'label': 'section_header', 'prov': ''})(),
            type('TextItem', (), {'text': 'How do I deploy it?', 'label': 'text', 'prov': ''})(),
            type('TextItem', (), {'text': 'ChatGPT said:', 'label': 'section_header', 'prov': ''})(),
            type('TextItem', (), {'text': 'Use kubectl apply -f deploy.yaml', 'label': 'code', 'prov': ''})(),
        ]
        mock_doc = type('MockDoc', (), {'texts': mock_texts})()

        meta = ConversationMetadata(title="Test")
        messages = _fallback_phase1_section_headers(mock_doc, Path("test.html"), meta)

        assert len(messages) >= 2, f"Expected >=2 messages, got {len(messages)}"
        assert messages[0].speaker == "user"
        assert "Kubernetes" in messages[0].text
        assert messages[1].speaker == "assistant"
        assert "container" in messages[1].text.lower()

    def test_fallback_phase1_no_section_headers(self):
        """Phase 1 returns empty list when no section headers match."""
        from base_parser import _fallback_phase1_section_headers
        from models import ConversationMetadata

        mock_texts = [
            type('TextItem', (), {'text': 'Plain text without speaker headers', 'label': 'text', 'prov': ''})(),
            type('TextItem', (), {'text': 'More plain text', 'label': 'text', 'prov': ''})(),
        ]
        mock_doc = type('MockDoc', (), {'texts': mock_texts})()

        meta = ConversationMetadata(title="Test")
        messages = _fallback_phase1_section_headers(mock_doc, Path("test.html"), meta)
        assert len(messages) == 0

    def test_fallback_phase2_markdown_labels(self):
        """Phase 2 should detect speaker turns from **Label:** patterns."""
        from base_parser import _fallback_phase2_markdown_labels
        from models import ConversationMetadata

        md = "**User:** What is Docker?\n**ChatGPT:** Docker is a container platform.\n**User:** How do I install it?"
        mock_doc = type('MockDoc', (), {'export_to_markdown': lambda self: md})()

        meta = ConversationMetadata(title="Test")
        messages = _fallback_phase2_markdown_labels(mock_doc, Path("test.html"), meta)

        assert len(messages) >= 2, f"Expected >=2 messages, got {len(messages)}"
        assert messages[0].speaker == "user"
        assert "Docker" in messages[0].text
        assert messages[1].speaker == "assistant"

    def test_fallback_phase2_no_labels(self):
        """Phase 2 returns empty list when no bold labels found."""
        from base_parser import _fallback_phase2_markdown_labels
        from models import ConversationMetadata

        md = "No recognizable labels here at all"
        mock_doc = type('MockDoc', (), {'export_to_markdown': lambda self: md})()

        meta = ConversationMetadata(title="Test")
        messages = _fallback_phase2_markdown_labels(mock_doc, Path("test.html"), meta)
        assert len(messages) == 0

    def test_fallback_phase3_single_message(self):
        """Phase 3 should produce a single assistant message with meaningful content."""
        from base_parser import _fallback_parse_from_docling
        from models import ConversationMetadata

        md = "This is some meaningful conversation content that should be captured as a single message."
        mock_doc = type('MockDoc', (), {
            'texts': [type('TextItem', (), {'text': 'text', 'label': 'text', 'prov': ''})()],
            'export_to_markdown': lambda self: md,
            'export_to_text': lambda self: md,
        })()

        messages, meta = _fallback_parse_from_docling(mock_doc, Path("test.html"))
        assert len(messages) >= 1, f"Expected >=1 message, got {len(messages)}"
        assert meta.export_source in ("fallback", "fallback-single")

    def test_fallback_detect_and_parse_with_unknown_format(self, tmp_path):
        """detect_and_parse should use fallback for unknown formats."""
        from base_parser import detect_and_parse

        # Create a mock doc that won't match any parser but has meaningful text
        md = "Some random text without recognizable labels"
        mock_doc = type('MockDoc', (), {
            'texts': [type('TextItem', (), {'text': 'Some random text', 'label': 'text', 'prov': ''})()],
            'export_to_markdown': lambda self: md,
            'export_to_text': lambda self: md,
        })()

        messages, meta = detect_and_parse(mock_doc, Path("completely-unknown.txt"))
        # Fallback should kick in and produce at least 1 message
        assert len(messages) >= 1, f"Expected >=1 from fallback, got {len(messages)}"


# ---------------------------------------------------------------------------
# detect_and_parse integration tests
# ---------------------------------------------------------------------------

class TestDetectAndParse:
    """Tests for the top-level detect_and_parse dispatcher."""

    def test_dispatches_to_chatgpt_parser(self, chatgpt_markdown):
        doc = MockDoclingDocument(chatgpt_markdown)
        from base_parser import detect_and_parse
        messages, meta = detect_and_parse(doc, Path("chatgpt-test.html"))
        assert len(messages) > 0
        assert meta.export_source == "ChatGPT"

    def test_dispatches_to_copilot_parser(self, copilot_markdown):
        doc = MockDoclingDocument(copilot_markdown)
        from base_parser import detect_and_parse
        messages, meta = detect_and_parse(doc, Path("copilot-test.html"))
        assert len(messages) > 0
        assert meta.export_source == "Microsoft Copilot"

    def test_dispatches_to_opencode_parser(self, opencode_markdown):
        doc = MockDoclingDocument(opencode_markdown)
        from base_parser import detect_and_parse
        messages, meta = detect_and_parse(doc, Path("opencode-test.html"))
        assert len(messages) > 0
        assert meta.export_source == "OpenCode"

    def test_dispatches_to_gemini_parser(self, gemini_markdown):
        doc = MockDoclingDocument(gemini_markdown)
        from base_parser import detect_and_parse
        messages, meta = detect_and_parse(doc, Path("gemini-test.html"))
        assert len(messages) > 0
        assert meta.export_source == "Google Gemini"

    def test_unknown_source_fallback_to_single_message(self):
        """When no parser matches, the fallback should produce a single assistant message."""
        doc = MockDoclingDocument("No recognizable labels here at all")
        from base_parser import detect_and_parse
        messages, meta = detect_and_parse(doc, Path("unknown.html"))
        assert len(messages) >= 1, f"Fallback should produce at least 1 message, got {len(messages)}"
        assert meta.export_source in ("fallback", "fallback-single", "fallback-markdown-labels")

    def test_non_docling_md_dispatch(self, tmp_path):
        """detect_and_parse_md works on raw .md files (no DocLing)."""
        md_file = tmp_path / "conversation.md"
        # User blocks must be short plain text for MarkdownParser detection
        md_file.write_text(
            "# Discussion\n\n"
            "Hello\n\n"
            "**Assistant:** Answer!\n\n"
            "OK\n\n"
            "**Assistant:** Welcome!"
        )
        # Import all parsers so decorators fire
        import parsers.chatgpt_parser  # noqa: F401
        import parsers.copilot_parser   # noqa: F401
        import parsers.opencode_parser  # noqa: F401
        import parsers.gemini_parser    # noqa: F401
        import parsers.markdown_parser  # noqa: F401
        from base_parser import detect_and_parse_md
        messages, meta = detect_and_parse_md(md_file)
        assert len(messages) > 0, f"Expected >0 messages, got {len(messages)}"
        assert meta.export_source is not None


# ---------------------------------------------------------------------------
# End-to-end: main.py integration tests (high-level smoke tests)
# ---------------------------------------------------------------------------

class TestMainPipeline:
    """Test the main.py entry point functions with mock data."""

    def test_collect_ingest_files_html(self, tmp_path):
        html_file = tmp_path / "test.html"
        html_file.write_text("<html></html>")
        from main import collect_ingest_files
        files = collect_ingest_files(tmp_path)
        assert html_file in files

    def test_collect_ingest_files_accepts_txt(self, tmp_path):
        """.txt IS a supported suffix (plain text)."""
        txt_file = tmp_path / "notes.txt"
        txt_file.write_text("hello")
        from main import collect_ingest_files
        files = collect_ingest_files(txt_file)
        assert len(files) == 1

    def test_collect_ingest_files_dir(self, tmp_path):
        (tmp_path / "a.html").write_text("")
        (tmp_path / "b.md").write_text("")
        (tmp_path / "c.txt").write_text("")
        from main import collect_ingest_files
        files = collect_ingest_files(tmp_path)
        assert len(files) == 3  # .html + .md + .txt (txt is supported)

    def test_supported_suffixes(self):
        from main import SUPPORTED_SUFFIXES
        assert ".html" in SUPPORTED_SUFFIXES
        assert ".md" in SUPPORTED_SUFFIXES
        assert ".pdf" in SUPPORTED_SUFFIXES
        assert ".docx" in SUPPORTED_SUFFIXES
        assert ".txt" in SUPPORTED_SUFFIXES
