---
project: nexus-ingest
dependencies: []
acceptance:
  - rg "BeautifulSoup|bs4|from bs4" /home/codex/dev/nexus/python/ingest/html-importer/parsers/ --include '*.py' --files-with-matches
  - ls /home/codex/dev/nexus/python/ingest/html-importer/parsers/
  - python -c "import docling; print(docling.__version__)"
---

# Plan 0086: Replace Ingest Parsers with DocLing Conversions

**Goal:** Replace the custom BeautifulSoup-based HTML parsers in
`nexus/python/ingest/html-importer/parsers/` with a DocLing-powered
conversion pipeline. DocLing (IBM Research) provides a unified,
well-tested document conversion engine that handles HTML, PDF, DOCX,
images (via OCR), and more — outputting a structured `DoclingDocument`
that the ingest pipeline can consume instead of raw BeautifulSoup trees.

**Status:** PLAN — ready for builder pickup

---

## Context: Current Architecture

### What the Ingest System Does

```
HTML/MD file → detect source → custom parser → NormalizedMessage list
                                                    ↓
                                   BaseParser span segmentation
                                   BaseParser discourse classification
                                   BaseParser CCNF text normalization
                                                    ↓
                                   IngestionCompiler → IR_v2_EventEnvelope
```

### Current Parsers (BeautifulSoup-based)

| Parser | Source | Detection | Complexity |
|--------|--------|-----------|------------|
| ChatGPT | `.html` | `data-message-author-role` in DOM | 200 lines — DOM traversal, citation stripping, embedded JSON metadata |
| Copilot | `.html` | `group/ai-message` or `group/user-message` classes | 250 lines — recursive block child extraction, table extraction, citation stripping |
| OpenCode | `.html` | `data-component="session-turn"` | 120 lines — turn-based DOM traversal, text-part extraction |
| Markdown | `.md` | Heuristic: short unformatted paragraphs = user | 120 lines — paragraph splitting, block-level format detection |
| Gemini | `.html` | Stub — not yet implemented | 30 lines |

Each parser subclasses `BaseParser` and implements:
- `can_handle(soup, path)` — source detection via DOM inspection
- `extract_metadata(soup, path)` — title, conversation ID, model, timestamps
- `parse(soup, path, metadata)` — message extraction with turn tracking
- `source_name` — human-readable label

All parsers depend on **BeautifulSoup** (`bs4`) and **lxml** for HTML parsing.

### What Gets Used from BaseParser

Parsers call these shared utilities after extracting raw text from the DOM:
- `normalize_text(text)` — CCNF unicode normalization, zero-width stripping, boilerplate removal
- `file_timestamp(path)` — fallback timestamp from filesystem
- `extract_images_from_message(msg_tag, ...)` — image reference extraction
- `_build_selector(tag)` — CSS selector path for traceability
- `parse_to_envelope(raw_text, ...)` — span decomposition pipeline
- `_segment_text(...)` — paragraph-level span segmentation (STRUCTURAL/DISCOURSE/EVENT/NOISE)
- `_classify_span_type(...)` — deterministic-first span classifier

---

## What DocLing Provides

DocLing converts documents into a unified `DoclingDocument` representation:

```
PDF/DOCX/PPTX/XLSX/HTML/Image → DocumentConverter → DoclingDocument
                                                        ├── texts[]          (flat list of text items)
                                                        ├── tables[]         (extracted tables)
                                                        ├── pictures[]       (embedded images)
                                                        ├── key_value_items[] (metadata extraction)
                                                        └── body (tree)      (hierarchical structure)
```

**Key capabilities relevant to ingest:**
1. **Multi-format support** — HTML, PDF, DOCX, PPTX, XLSX, EPUB, images (PNG/JPEG/TIFF), plain text
2. **Robust HTML parsing** — handles malformed HTML, extracts structured content with layout hierarchy
3. **Table extraction** — structured table data with cell-level provenance
4. **Image extraction** — embedded images extracted as `PictureItem` with bounding boxes
5. **Batch processing** — `convert_all()` with `raises_on_error=False` for resilient pipelines
6. **Export methods** — `export_to_markdown()`, `export_to_html()`, `export_to_dict()`, `export_to_json()`, `export_to_text()`
7. **OCR support** — EasyOCR, Tesseract, RapidOCR for scanned/image-based documents

**What DocLing does NOT provide:**
- Chat/transcript-specific handling (no speaker detection, turn tracking, message boundaries)
- Source detection (no ChatGPT vs Copilot vs OpenCode differentiation)
- Conversation metadata extraction (title, model, conversation ID from DOM)
- Discourse role classification (hedge, framing, emphasis, meta)
- CCNF normalization (zero-width chars, boilerplate stripping)

---

## Strategy: Two-Layer Architecture

DocLing replaces the **HTML parsing layer** (BeautifulSoup DOM traversal) with
a cleaner `DoclingDocument` traversal. The **chat-semantic layer** (source
detection, speaker identification, turn tracking, metadata extraction) remains
custom but operates on DocLingDocument instead of BeautifulSoup.

### Before
```
HTML file → BeautifulSoup(lxml) → soup.find_all(...) → raw text → BaseParser utilities
```

### After
```
HTML/PDF/DOCX/MD → DocumentConverter → DoclingDocument → custom extractors → raw text → BaseParser utilities
```

The critical insight: **DocLing produces clean, structured text with layout
hierarchy preserved.** The chat extractors no longer need to parse raw HTML
elements — they traverse the DoclingDocument tree to find message boundaries,
speaker labels, and content regions.

---

## Phase 1: Dependency Migration

### 1.1 Add DocLing to Requirements

**File: `nexus/python/ingest/html-importer/requirements.txt`**

```diff
- beautifulsoup4==4.14.3
- lxml==6.0.4
- soupsieve==2.8.3
+ docling>=2.0.0
+ docling[easyocr]>=2.0.0
  typing_extensions==4.15.0
```

DocLing bundles its own HTML parser. Removing `beautifulsoup4`, `lxml`, and
`soupsieve` reduces the dependency footprint (3 packages → 1).

### 1.2 Install and Verify

```bash
cd nexus/python/ingest/html-importer
pip install "docling[easyocr]>=2.0.0"
python -c "from docling.document_converter import DocumentConverter; print('DocLing OK')"
python -c "from docling.document_converter import DocumentConverter; d = DocumentConverter(); r = d.convert('samples/sample.html'); print(f'Items: {len(r.document.texts)}')"
```

---

## Phase 2: DocLingDocument Traversal Adaptor

### 2.1 New Module: `docling_adapter.py`

Create a thin adaptor layer that wraps DocLing conversion and provides
a chat-oriented query API on top of `DoclingDocument`.

**File: `nexus/python/ingest/html-importer/docling_adapter.py`**

```python
"""Adaptor: DocLingDocument → chat message extraction primitives."""

from pathlib import Path
from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions


class DoclingAdapter:
    """Wraps DocLing conversion and provides chat-extraction queries."""

    def __init__(self, enable_ocr: bool = False):
        self._converter = DocumentConverter()
        self._enable_ocr = enable_ocr

    def convert(self, path: Path):
        """Convert any supported document to a DoclingDocument."""
        return self._converter.convert(str(path))

    def convert_all(self, paths: list[Path]):
        """Batch convert with error isolation."""
        return self._converter.convert_all(
            [str(p) for p in paths],
            raises_on_error=False,
        )

    # ── DoclingDocument query API ──────────────────────────────────────

    @staticmethod
    def extract_text_items(doc) -> list[dict]:
        """Extract all text items with their hierarchy position."""
        items = []
        for text_item in doc.texts:
            items.append({
                "text": text_item.text,
                "label": text_item.label,         # e.g. "paragraph", "heading", "list_item"
                "prov": text_item.prov,            # provenance (page, bbox)
            })
        return items

    @staticmethod
    def extract_tables(doc) -> list[dict]:
        """Extract tables as structured data."""
        tables = []
        for table in doc.tables:
            cells = []
            for cell in table.data.table_cells:
                cells.append({
                    "text": cell.text,
                    "row": cell.start_row_offset,
                    "col": cell.start_col_offset,
                })
            tables.append({"cells": cells})
        return tables

    @staticmethod
    def export_to_text(doc) -> str:
        """Export DoclingDocument to plain text (with layout)."""
        return doc.export_to_text()

    @staticmethod
    def export_to_markdown(doc) -> str:
        """Export DoclingDocument to Markdown."""
        return doc.export_to_markdown()
```

### 2.2 Design Principle: Keep BaseParser Utilities

The existing `BaseParser` utilities that operate on **extracted text** (not DOM)
remain unchanged:
- `normalize_text(text)` — CCNF normalization (still needed)
- `_segment_text(...)` — span decomposition (still needed)
- `_classify_span_type(...)` — classifier (still needed)
- `parse_to_envelope(...)` — envelope pipeline (still needed)
- `strip_boilerplate(...)` — boilerplate removal (still needed)

These are text-in/text-out operations. DocLing handles format-in/text-out.
The text pipeline remains intact.

---

## Phase 3: Parser-by-Parser Migration

### 3.1 Migration Pattern

Each parser transitions from:

```python
def can_handle(self, soup: BeautifulSoup, source_path: Path) -> bool:
    return soup.find(attrs={"data-message-author-role": True}) is not None

def parse(self, soup: BeautifulSoup, source_path: Path, metadata) -> list:
    message_divs = soup.find_all(attrs={"data-message-author-role": True})
    for msg in message_divs:
        text = self._extract_text(msg, speaker)  # DOM traversal
```

To:

```python
def can_handle(self, doc: DoclingDocument, source_path: Path) -> bool:
    # Detect source from text patterns or exported markdown structure
    return self._detect_author_role_pattern(doc)

def parse(self, doc: DoclingDocument, source_path: Path, metadata) -> list:
    text_items = DoclingAdapter.extract_text_items(doc)
    messages = self._reconstruct_messages(text_items)
    for msg in messages:
        text = BaseParser.normalize_text(msg["raw_text"])
```

### 3.2 Impact per Parser

#### ChatGPT Parser (chatgpt_parser.py)

| Before (BeautifulSoup) | After (DocLing) |
|------------------------|-----------------|
| `soup.find_all(attrs={"data-message-author-role": True})` | Parse exported markdown for `**User**` / `**ChatGPT**` patterns |
| `msg_tag.find("div", class_="whitespace-pre-wrap")` | DoclingDocument label-based text grouping |
| `soup.find("title")` → title | DoclingDocument metadata or first heading |
| `soup.find("link", rel="canonical")` → conversation ID | Extract from URL patterns in text |
| Embedded JSON in `<script>` tags | Not available via DocLing — fallback to file timestamp |

**Migration complexity: MEDIUM.** Detection shifts from DOM attributes to text
pattern matching on the exported markdown. Most ChatGPT HTML exports
render cleanly through DocLing's HTML parser.

#### Copilot Parser (copilot_parser.py)

| Before (BeautifulSoup) | After (DocLing) |
|------------------------|-----------------|
| `soup.find(class_="group/ai-message")` | Pattern match `**Copilot**` / `**You**` in markdown |
| Recursive block children extraction | DocLing document tree traversal by section |
| Table extraction via custom `_extract_table()` | **DocLing's native table extraction** (drop 50 lines of custom code!) |
| Citation stripping from DOM buttons/sup | Regex-based citation stripping on text |

**Migration complexity: MEDIUM-HIGH.** The Copilot parser has the most complex
DOM traversal. DocLing's table extraction and hierarchical structure should
simplify most of the recursive block extraction logic.

#### OpenCode Parser (opencode_parser.py)

| Before (BeautifulSoup) | After (DocLing) |
|------------------------|-----------------|
| `soup.find(attrs={"data-component": "session-turn"})` | Detect OpenCode-specific text markers |
| `turn.find(attrs={"data-component": "text-part"})` | Section-based text grouping |

**Migration complexity: LOW-MEDIUM.** The simplest of the HTML parsers.

#### Markdown Parser (markdown_parser.py)

| Before (raw text + regex) | After (DocLing) |
|---------------------------|-----------------|
| Direct file read + `re.split(r"\n{2,}")` | DocLing parses .md into structured document |
| Custom `_is_user_block(...)` heuristic | DocLing label-based + heuristic detection |
| `_split_blocks_with_lines(...)` custom splitter | DocLing text items with provenance |

**Migration complexity: LOW.** DocLing parses Markdown natively. The heuristic
for detecting user vs assistant blocks stays the same but operates on cleaner
input.

#### Gemini Parser (gemini_parser.py) — Stub

Currently a stub. Should be implemented using DocLing from the start rather
than porting BeautifulSoup code.

**Migration complexity: N/A (new implementation).**

---

## Phase 4: BaseParser Refactoring

### 4.1 Remove BeautifulSoup-Specific Methods

The following methods in `BaseParser` are BeautifulSoup-specific and should
be removed or rewritten for DocLing:

| Method | Fate |
|--------|------|
| `extract_images_from_message(msg_tag, ...)` | Rewritten: iterate `doc.pictures` instead of `msg_tag.find_all("img")` |
| `_build_selector(tag)` | Removed: DocLing prov provides position/bbox, not CSS selectors |
| `_is_avatar(img_tag)` | Rewritten: operate on `PictureItem` caption/anchor text |
| `_is_tiny_tracking(img_tag)` | Rewritten: DocLing filters noise images already |
| `_check_if_saved(src, ...)` | Rewritten: DocLing `PictureItem` has image data directly |

### 4.2 Update Image Extraction

DocLing extracts images as `PictureItem` objects in `doc.pictures`. Each
`PictureItem` has:
- `image` — PIL Image or raw bytes
- `caption` — optional caption text
- `prov` — provenance with bounding box and page

The image extraction path becomes:

```python
@staticmethod
def extract_images_from_document(doc) -> list[ImageReference]:
    """Extract images from a DoclingDocument."""
    results = []
    for i, picture in enumerate(doc.pictures):
        name = f"image-{i+1}.png"  # DocLing renders as PNG
        results.append(ImageReference(
            name=name,
            saved=False,
            original_src=f"docling://picture-{i}",
        ))
    return results
```

### 4.3 Update Parser Registry

The registry system (`@register_parser`, `get_parsers()`, `detect_and_parse()`)
stays but the signature changes from `(BeautifulSoup, Path)` to
`(DoclingDocument, Path)`.

```python
def detect_and_parse(
    doc: DoclingDocument, source_path: Path
) -> tuple[list[NormalizedMessage], ConversationMetadata]:
    for parser in get_parsers():
        if parser.can_handle(doc, source_path):
            metadata = parser.extract_metadata(doc, source_path)
            metadata.export_source = parser.source_name
            messages = parser.parse(doc, source_path, metadata)
            return messages, metadata
    # fallback...
```

---

## Phase 5: Main Entry Point Refactoring

### 5.1 `main.py` Changes

**Before:**
```python
from bs4 import BeautifulSoup
soup = BeautifulSoup(html_content, "lxml")
return detect_and_parse(soup, filepath)
```

**After:**
```python
from docling_adapter import DoclingAdapter

adapter = DoclingAdapter(enable_ocr=args.ocr)
result = adapter.convert(filepath)
return detect_and_parse(result.document, filepath)
```

### 5.2 New Format Support

DocLing unlocks support for document formats the current system cannot handle:

| New Format | Use Case |
|------------|----------|
| PDF chat exports | ChatGPT "Print to PDF", Copilot PDF exports |
| DOCX transcripts | Meeting transcripts exported as Word docs |
| Images (OCR) | Screenshots of chat conversations |
| EPUB | Saved reading conversations |
| PPTX | Presentation-based training transcripts |

These should be whitelisted in `collect_html_files()` (renamed to
`collect_ingest_files()`):

```python
SUPPORTED_SUFFIXES = (
    ".html", ".htm", ".md", ".markdown",  # existing
    ".pdf", ".docx", ".pptx", ".xlsx",    # new via DocLing
    ".epub", ".txt",                       # new via DocLing
    ".png", ".jpg", ".jpeg", ".tiff",     # new via DocLing OCR
)
```

### 5.3 Add `--ocr` CLI Flag

```bash
python main.py screenshots/ --ocr       # Enable OCR for image files
python main.py transcript.docx --json   # DOCX via DocLing
python main.py chats/ --ocr --json -o out.json
```

---

## Phase 6: Testing & Validation

### 6.1 Comparison Test Framework

Create `test_docling_migration.py` that:
1. Parses a sample file using the **current** BeautifulSoup parser
2. Parses the **same** file using the **new** DocLing parser
3. Compares: message count, speaker sequence, text similarity (Levenshtein)
4. Reports differences with per-message delta

```python
def test_parser_equivalence(source_path: Path):
    """Assert DocLing parser produces equivalent output to BS4 parser."""
    old_messages = parse_with_bs4(source_path)
    new_messages = parse_with_docling(source_path)

    assert len(old_messages) == len(new_messages), \
        f"Message count mismatch: {len(old_messages)} vs {len(new_messages)}"

    for old, new in zip(old_messages, new_messages):
        assert old.speaker == new.speaker, \
            f"Speaker mismatch at turn {old.turn_index}"
        similarity = text_similarity(old.text, new.text)
        assert similarity > 0.90, \
            f"Text divergence ({similarity:.2f}) at turn {old.turn_index}"
```

### 6.2 Test Files to Validate

| Sample File | Parser | Expected Messages |
|-------------|--------|-------------------|
| ChatGPT export `.html` | chatgpt_parser | User + assistant turns |
| Copilot export `.html` | copilot_parser | User + assistant turns with tables |
| OpenCode export `.html` | opencode_parser | Session turns |
| Markdown chat `.md` | markdown_parser | Alternating blocks |
| PDF chat export `.pdf` | NEW via DocLing | Text extraction with OCR |
| Screenshot `.png` | NEW via DocLing | OCR text extraction |

### 6.3 Regression Tests

Existing tests in `html-importer/`:
- `test_opencode_parser.py`
- `test_opencode.py`

These must be updated to use DocLing documents instead of BeautifulSoup
fixtures.

---

## Phase 7: Performance Benchmark

### 7.1 Expected Impact

| Metric | Before (BeautifulSoup+lxml) | After (DocLing) | Change |
|--------|----------------------------|-----------------|--------|
| HTML parse time (100KB) | ~50ms | ~200ms | Slower (DocLing does more work) |
| PDF support | N/A | ~2s/page (with OCR) | NEW |
| DOCX support | N/A | ~100ms | NEW |
| Memory per document | ~10MB (lxml tree) | ~50MB (DocLing models) | Higher |
| Dependencies | 3 (bs4, lxml, soupsieve) | 1 (docling) | Fewer packages |

DocLing is heavier than raw BeautifulSoup because it does layout analysis,
table detection, and structure inference. This is acceptable for an ingest
pipeline where correctness matters more than throughput.

### 7.2 Mitigations

- Use `convert_all()` for batch processing (reuses models)
- Skip OCR when not needed (`enable_ocr=False` by default)
- Cache DocumentConverter instance (model loading is expensive)
- Option to keep BeautifulSoup as a fast path for HTML-only files

---

## Phase 8: Rollout Plan

### 8.1 Dual-Parser Transition Period

Instead of a hard cutover, support both paths for 2 weeks:

```python
# main.py
from docling_adapter import DoclingAdapter

USE_DOCLING = os.environ.get("INGEST_USE_DOCLING", "0") == "1"

if USE_DOCLING:
    adapter = DoclingAdapter()
    doc = adapter.convert(filepath).document
    return detect_and_parse(doc, filepath)
else:
    soup = BeautifulSoup(html_content, "lxml")
    return detect_and_parse(soup, filepath)
```

Run both parsers in parallel on real data, compare outputs, and track
divergence. After the divergence rate drops to <1%, remove the BS4 path.

### 8.2 Migration Order

1. **Markdown parser** (easiest, low risk) — validate DocLing markdown parsing
2. **OpenCode parser** (simple HTML) — validate DocLing HTML structure extraction
3. **ChatGPT parser** (medium complexity) — validate text extraction fidelity
4. **Copilot parser** (most complex) — validate table extraction improves
5. **Gemini parser** — implement fresh on DocLing
6. **New format support** — PDF, DOCX, images (OCR)

---

## Files Affected Summary

### New Files (4)
| File | Purpose |
|------|---------|
| `ingest/html-importer/docling_adapter.py` | Thin DocLingDocument wrapper with chat extraction queries |
| `ingest/html-importer/test_docling_migration.py` | Comparison test: BS4 output vs DocLing output |
| `ingest/html-importer/DOCLING_MIGRATION.md` | Migration status tracker (checklist per parser) |
| `ingest/html-importer/samples/` | Add PDF, DOCX, PNG sample files for testing |

### Modified Files (9)
| File | Change |
|------|--------|
| `ingest/html-importer/requirements.txt` | Replace bs4/lxml/soupsieve with docling |
| `ingest/html-importer/base_parser.py` | Remove BS4-specific methods; update registry signatures; rewrite image extraction for DoclingDocument |
| `ingest/html-importer/parsers/chatgpt_parser.py` | `can_handle` and `parse` signatures → DoclingDocument; DOM selectors → text pattern matching |
| `ingest/html-importer/parsers/copilot_parser.py` | Same; drop custom `_extract_table()` in favor of DocLing native table extraction |
| `ingest/html-importer/parsers/opencode_parser.py` | Same; DOM-based turn detection → text pattern matching |
| `ingest/html-importer/parsers/markdown_parser.py` | Raw file read → DocLing document; simpler detection |
| `ingest/html-importer/parsers/gemini_parser.py` | Implement on DocLingDocument (no BeautifulSoup) |
| `ingest/html-importer/main.py` | Replace BeautifulSoup with DoclingAdapter; add `--ocr` flag; add new format support; rename `collect_html_files` → `collect_ingest_files` |
| `ingest/html-importer/parsers/__init__.py` | Uncomment Gemini import; verify all imports |

### Removed Dependencies (3)
| Package | Reason |
|---------|--------|
| `beautifulsoup4` | Replaced by DocLing HTML parser |
| `lxml` | Replaced by DocLing |
| `soupsieve` | Replaced by DocLing |

### Unchanged (preserved)
| Component | Reason |
|-----------|--------|
| `BaseParser.normalize_text()` | Text-in/text-out; CCNF normalization still needed |
| `BaseParser._segment_text()` | Span decomposition still needed |
| `BaseParser._classify_span_type()` | Classifier still needed |
| `BaseParser.parse_to_envelope()` | Envelope pipeline still needed |
| `models.py` | All data models unchanged (NormalizedMessage, Span, etc.) |
| `ingestion_compiler.py` | Operates on NormalizedMessages, not raw input |
| `graph_builder.py`, `graph_validator.py`, etc. | Downstream pipeline unchanged |

---

## Acceptance Criteria

1. **All 5 parsers** (`chatgpt`, `copilot`, `opencode`, `markdown`, `gemini`)
   subclass `BaseParser` and accept `DoclingDocument` instead of `BeautifulSoup`
2. **`can_handle()`** correctly detects source type from DoclingDocument (not
   from DOM selectors)
3. **Message extraction** produces equivalent output to current BS4 parsers
   (±1% text divergence on samples)
4. **HTML files** parse without `bs4` or `lxml` imports in any parser file
5. **No regression** — existing tests pass after updating fixtures
6. **New format support** — `main.py` accepts `.pdf`, `.docx`, `.pptx`, `.xlsx`
   files
7. **OCR flag** — `--ocr` enables OCR for image-based documents
8. **Batch processing** — `convert_all()` used for directory inputs with error
   isolation
9. **`requirements.txt`** lists `docling>=2.0.0` and does NOT list
   `beautifulsoup4`, `lxml`, or `soupsieve`
10. **DocLing migration test** runs comparison on all sample files and reports
    divergence metrics

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Text extraction differences** between BS4 and DocLing | High | Medium | Comparison test framework catches divergence; adjust post-processing |
| **DocLing heavier/slower** than BS4 | High | Low | Acceptable for ingest pipeline; batch mode amortizes cost |
| **DocLing can't parse some HTML exports** (malformed HTML) | Medium | High | BS4 fallback path during transition period; report to DocLing upstream |
| **ChatGPT DOM attributes not representable** in DoclingDocument | Medium | Medium | Metadata extraction switches to text-pattern heuristics; some metadata loss |
| **Citation stripping gaps** (DocLing doesn't strip DOM citations) | Medium | Low | Regex-based citation stripping on output text (already in chatgpt_parser) |
| **Image extraction differences** (DocLing vs BS4 `find_all("img")`)  | Low | Low | DocLing picture extraction is more reliable; only content images extracted |
| **Gemini parser never implemented** — no sample to test against | Low | Low | Implement for DocLingDocument; validate when sample becomes available |

---

## Future Scope

1. **RAG integration** — DocLing's `export_to_markdown()` output is directly
   ingestible by vector databases and LLM frameworks (LangChain, LlamaIndex)
2. **Multimodal chat parsing** — DocLing OCR enables parsing screenshot-based
   chat conversations (Discord, Slack, WhatsApp screenshots)
3. **Automatic source detection** — DocLing's structure analysis could detect
   chat source automatically from layout patterns (no `can_handle()` needed)
4. **Streaming ingest** — hook DocLing into a watch folder for real-time
   chat export processing

---

*Plan created: 2026-06-15. Part of the ingest pipeline modernization series.*
