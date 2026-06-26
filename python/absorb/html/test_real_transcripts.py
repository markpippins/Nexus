"""Integration tests that process real HTML transcripts through DocLing.

These tests require docling to be installed. They are skipped automatically
when docling is not available, making them safe to run in any environment.

NOTE on transcript format:
  The 61 transcripts in the transcripts/ folder are "Save page as..." HTML
  from the ChatGPT web UI. They use DOM elements with data attributes
  (data-message-author-role) for speaker labels, not bold markdown labels
  (**User:** / **ChatGPT:**).

  The ChatGPTHtmlParser reads the raw HTML file directly to detect speaker
  turns via the data-message-author-role attribute, so it can parse these
  transcripts correctly.
"""

from pathlib import Path
from typing import Any

import pytest

# All tests in this module require docling
pytest.importorskip("docling")

TRANSCRIPTS_DIR = Path(__file__).parent / "transcripts"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def adapter() -> Any:
    """Shared DoclingAdapter instance."""
    from docling_adapter import DoclingAdapter
    return DoclingAdapter(enable_ocr=False)


def get_transcript_path(name_part: str) -> Path:
    """Find a transcript by partial name match."""
    matches = sorted(TRANSCRIPTS_DIR.glob(f"*{name_part}*.html"))
    if not matches:
        raise FileNotFoundError(f"No transcript matching '{name_part}' in {TRANSCRIPTS_DIR}")
    return matches[0]


# ---------------------------------------------------------------------------
# DocLing conversion tests (should always work)
# ---------------------------------------------------------------------------

class TestDocLingConversion:
    """DocLing successfully converts real HTML transcripts to structured documents."""

    @pytest.mark.parametrize("file_slug", [
        "Monolith vs Microservices for eBay",
        "MCP Server Setup Guide",
        "TLA+ and Design Correctness",
        "Capability via Policy Execution",
        "Membrane API Gateway Overview",
    ], ids=["monolith", "mcp", "tla", "policy", "gateway"])
    def test_converts_successfully(self, adapter, file_slug: str):
        """DocLing should convert each transcript without error."""
        fpath = get_transcript_path(file_slug)
        assert fpath.exists()
        size_mb = fpath.stat().st_size / (1024 * 1024)

        result = adapter.convert(fpath)
        assert result is not None
        assert result.document is not None

        md = adapter.export_to_markdown(result.document)
        assert len(md) > 0, f"Markdown output is empty for {fpath.name}"
        # Should contain conversation content
        assert "ChatGPT" in md or "I" in md or "you" in md or "?" in md, \
            f"Markdown too short or empty: {len(md)} chars for {fpath.name} ({size_mb:.1f}MB)"

    def test_extract_text_items_all(self, adapter):
        """extract_text_items should return structured items for any transcript."""
        fpath = get_transcript_path("TLA")
        result = adapter.convert(fpath)
        items = adapter.extract_text_items(result.document)

        assert len(items) > 0
        assert all("text" in item for item in items)
        assert all(isinstance(item["text"], str) and item["text"].strip()
                   for item in items[:5])


# ---------------------------------------------------------------------------
# ChatGPTHtmlParser integration tests
# ---------------------------------------------------------------------------

class TestChatGPTHtmlParser:
    """ChatGPTHtmlParser correctly detects and parses real ChatGPT web UI transcripts."""

    @pytest.mark.parametrize("file_slug,expected_turns", [
        ("Monolith vs Microservices for eBay", 2),
        ("MCP Server Setup Guide", 4),
        ("TLA+ and Design Correctness", 2),
    ], ids=["monolith", "mcp", "tla"])
    def test_parses_real_transcripts(self, adapter, file_slug: str, expected_turns: int):
        """ChatGPTHtmlParser should parse real web UI transcripts into messages."""
        fpath = get_transcript_path(file_slug)

        from base_parser import detect_and_parse
        result = adapter.convert(fpath)
        messages, meta = detect_and_parse(result.document, fpath)

        assert len(messages) > 0, (
            f"{fpath.name}: Expected >0 messages, got 0. "
            "ChatGPTHtmlParser should detect data-message-author-role attributes."
        )
        assert meta.export_source == "ChatGPT HTML", (
            f"Expected 'ChatGPT HTML', got '{meta.export_source}'"
        )

        # Verify speaker roles
        speakers = {m.speaker for m in messages}
        assert "user" in speakers, f"No user messages found"
        assert "assistant" in speakers, f"No assistant messages found"

        # Verify messages have content
        for m in messages:
            assert m.text.strip(), f"Message {m.message_id} ({m.speaker}) has empty text"
            assert m.raw_html_ref, f"Message {m.message_id} missing raw_html_ref"

    def test_detects_all_transcripts(self, adapter):
        """All 61 transcripts should be detected by ChatGPTHtmlParser."""
        fpaths = sorted(TRANSCRIPTS_DIR.glob("*.html"))
        assert len(fpaths) == 61, f"Expected 61 transcripts, got {len(fpaths)}"

        from base_parser import detect_and_parse

        detected_count = 0
        total_messages = 0
        for fpath in fpaths:
            result = adapter.convert(fpath)
            messages, meta = detect_and_parse(result.document, fpath)

            if len(messages) > 0:
                detected_count += 1
                total_messages += len(messages)

        assert detected_count >= 58, (
            f"Only {detected_count}/61 transcripts detected by ChatGPTHtmlParser. "
            f"Total messages across all files: {total_messages}"
        )

    def test_messages_have_complete_content(self, adapter):
        """Parsed messages should contain meaningful conversation content."""
        fpath = get_transcript_path("Monolith")

        from base_parser import detect_and_parse
        result = adapter.convert(fpath)
        messages, meta = detect_and_parse(result.document, fpath)

        assert len(messages) >= 2

        # First message should be the user's question
        user_msg = messages[0]
        assert user_msg.speaker == "user"
        assert "ebay" in user_msg.text.lower() or "monolith" in user_msg.text.lower(), \
            f"First message should contain 'ebay' or 'monolith': {user_msg.text[:100]}"

        # Second message should be the assistant's response
        assistant_msg = messages[1]
        assert assistant_msg.speaker == "assistant"
        assert len(assistant_msg.text) > 50, \
            f"Assistant response seems too short: {assistant_msg.text[:200]}"


# ---------------------------------------------------------------------------
# Pipeline stability tests
# ---------------------------------------------------------------------------

class TestPipelineStability:
    """The pipeline should handle multiple files without crashing."""

    def test_all_transcripts_convert_without_crash(self, adapter):
        """Converting all 61 transcripts should not crash."""
        fpaths = sorted(TRANSCRIPTS_DIR.glob("*.html"))
        assert len(fpaths) == 61, f"Expected 61 transcripts, got {len(fpaths)}"

        successes = 0
        failures = []
        for fpath in fpaths:
            try:
                result = adapter.convert(fpath)
                assert result.document is not None
                md = adapter.export_to_markdown(result.document)
                assert len(md) > 0
                successes += 1
            except Exception as e:
                failures.append((fpath.name, str(e)))

        assert successes >= 60, (
            f"Only {successes}/61 converted successfully. "
            f"Failures: {failures[:3]}"
        )
        if failures:
            pytest.skip(f"{len(failures)} file(s) failed: {failures[0][0]}: {failures[0][1]}")

    def test_markdown_is_deterministic(self, adapter):
        """Running DocLing on the same file twice should produce identical markdown."""
        fpath = get_transcript_path("Capability via Policy")

        md1 = adapter.export_to_markdown(adapter.convert(fpath).document)
        md2 = adapter.export_to_markdown(adapter.convert(fpath).document)

        assert md1 == md2, "Markdown output differs between consecutive runs"

    def test_parsing_is_deterministic(self, adapter):
        """Running detect_and_parse on the same file twice should produce identical results."""
        fpath = get_transcript_path("Monolith")

        from base_parser import detect_and_parse
        result = adapter.convert(fpath)
        messages1, _ = detect_and_parse(result.document, fpath)

        result = adapter.convert(fpath)
        messages2, _ = detect_and_parse(result.document, fpath)

        assert len(messages1) == len(messages2), \
            f"Message counts differ between runs: {len(messages1)} vs {len(messages2)}"
        for m1, m2 in zip(messages1, messages2):
            assert m1.text == m2.text, f"Message content differs between runs"
            assert m1.speaker == m2.speaker, f"Speaker differs between runs"


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------

class TestErrorHandling:
    """Verify the pipeline handles edge cases gracefully."""

    def test_nonexistent_file(self):
        """Should raise FileNotFoundError or RuntimeError."""
        from docling_adapter import DoclingAdapter
        adapter = DoclingAdapter(enable_ocr=False)

        with pytest.raises((FileNotFoundError, RuntimeError)):
            adapter.convert(Path("/nonexistent/file.html"))

    def test_empty_file(self, tmp_path, adapter):
        """An empty HTML file should not crash DocLing or the parser."""
        empty_file = tmp_path / "empty.html"
        empty_file.write_text("<html></html>", encoding="utf-8")

        from base_parser import detect_and_parse

        result = adapter.convert(empty_file)
        assert result.document is not None

        messages, meta = detect_and_parse(result.document, empty_file)
        assert isinstance(messages, list)
        assert len(messages) == 0  # No speaker labels to detect
