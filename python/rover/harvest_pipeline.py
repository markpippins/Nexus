#!/usr/bin/env python3
"""
Rover: Chat Transcript Harvesting Pipeline

Ingests HTML chat transcripts, extracts specification candidates and
harvested code blocks via Docling + Ollama (local or remote).

Usage:
    python3 harvest_pipeline.py --input transcript.html --output agenda.md
    python3 harvest_pipeline.py --input transcript.html --output agenda.md \\
        --model nemotron-3-nano:4b
    python3 harvest_pipeline.py --input transcript.html --output agenda.md \\
        --model qwen3:4b --ollama-url http://strontium:11434
"""

import argparse
import json
import logging
import sys

from langchain_text_splitters import RecursiveCharacterTextSplitter

from schemas import SpecificationAgenda

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("rover")

CODE_HARVESTER_PROMPT = """
You are an advanced Software Archaeologist and Technical Analyst. Your primary mission is to extract actionable engineering intent and harvest implementable code blocks from unstructured developer chat transcripts.

Follow these execution guidelines closely:
1. Exact Code Extraction: If a participant shares code, scripts, configurations, or schemas, extract it word-for-word. Never truncate code with placeholders like '// ... rest of code'.
2. Code Contextualization: Link the code to its corresponding "Specification Candidate." Do not leave code blocks floating without their intent explanation.
3. Code Version Tracking: If a code snippet is updated or refactored later in the chat, capture the final corrected version as the primary asset, and note the change in implementation notes.
4. Separate Discussion from Code: Ensure conversational text surrounding the code blocks remains in the intent descriptions, while code objects contain only valid, executable script syntax.
"""


def convert_to_markdown(html_path: str) -> str:
    from docling.document_converter import DocumentConverter

    log.info("Converting %s via Docling...", html_path)
    converter = DocumentConverter()
    result = converter.convert(html_path)
    markdown = result.document.export_to_markdown()
    log.info("Docling produced %d characters", len(markdown))
    return markdown


def chunk_text(text: str, chunk_size: int = 40000, overlap: int = 4000) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        length_function=len,
    )
    chunks = splitter.split_text(text)
    log.info("Split into %d chunks (size=%d, overlap=%d)", len(chunks), chunk_size, overlap)
    return chunks


def extract_chunk(
    chunk: str,
    chunk_index: int,
    total_chunks: int,
    model: str = "qwen3.5:4b",
    ollama_url: str = "http://localhost:11434",
) -> SpecificationAgenda | None:
    estimated_tokens = len(chunk) // 4
    target_ctx = max(8192, min(65536, estimated_tokens + 4096))

    log.info(
        "Chunk %d/%d — ~%d tokens, ctx=%d, model=%s, url=%s",
        chunk_index + 1, total_chunks, estimated_tokens, target_ctx,
        model, ollama_url,
    )

    try:
        import httpx

        resp = httpx.post(
            f"{ollama_url.rstrip('/')}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": CODE_HARVESTER_PROMPT},
                    {"role": "user", "content": f"Analyze this chat log and harvest all architectural specifications and code blocks:\n\n{chunk}"},
                ],
                "format": SpecificationAgenda.model_json_schema(),
                "options": {
                    "num_ctx": target_ctx,
                    "temperature": 0.1,
                    "num_thread": 3,
                },
                "stream": False,
            },
            timeout=600.0,
        )
        resp.raise_for_status()
        raw = resp.json()["message"]["content"]
        data = json.loads(raw)
        agenda = SpecificationAgenda.model_validate(data)
        log.info("Chunk %d/%d — extracted %d items", chunk_index + 1, total_chunks, len(agenda.agenda_items))
        return agenda

    except json.JSONDecodeError as e:
        log.error("Chunk %d/%d — JSON parse error: %s", chunk_index + 1, total_chunks, e)
    except Exception as e:
        log.error("Chunk %d/%d — extraction failed: %s", chunk_index + 1, total_chunks, e)

    return None


def agenda_to_markdown(agenda: SpecificationAgenda, chunk_label: str = "") -> str:
    md = []

    for idx, item in enumerate(agenda.agenda_items, 1):
        md.append(f"## {idx}. {item.title}")
        md.append(f"**Status:** `{item.status}`\n")
        md.append(f"### Architectural Intent\n{item.intent_description}\n")

        if item.requirements:
            md.append("### Requirements & Acceptance Criteria")
            for req in item.requirements:
                md.append(f"- [ ] {req}")
            md.append("")

        if item.code_snippets:
            md.append("### Harvested Code Artifacts")
            for code in item.code_snippets:
                md.append(f"#### Purpose: {code.purpose}")
                md.append(f"```{code.language}")
                md.append(code.raw_code.strip())
                md.append("```\n")

        if item.open_questions:
            md.append("### Unresolved Follow-Ups")
            for q in item.open_questions:
                md.append(f"- {q}")
            md.append("")

        md.append("---\n")

    return "\n".join(md)


def run_pipeline(
    input_path: str,
    output_path: str,
    model: str = "qwen3.5:4b",
    ollama_url: str = "http://localhost:11434",
) -> int:
    markdown = convert_to_markdown(input_path)

    chunks = chunk_text(markdown)

    if not chunks:
        log.warning("No chunks produced from input")
        return 1

    all_items = []
    failures = 0

    for i, chunk in enumerate(chunks):
        result = extract_chunk(chunk, i, len(chunks), model=model, ollama_url=ollama_url)
        if result is not None:
            all_items.append(result)
        else:
            failures += 1

    combined = SpecificationAgenda(agenda_items=[])
    for agenda in all_items:
        combined.agenda_items.extend(agenda.agenda_items)

    md_lines = ["# Harvested Specification & Code Repository\n"]
    md_lines.append(f"**Source:** `{input_path}`\n")
    md_lines.append(f"**Model:** {model} ({ollama_url})\n")
    md_lines.append(f"**Chunks processed:** {len(chunks)}  **Failed:** {failures}\n")
    md_lines.append(f"**Total candidates:** {len(combined.agenda_items)}\n")
    md_lines.append("---\n")

    for agenda in all_items:
        md_lines.append(agenda_to_markdown(agenda))

    output = "\n".join(md_lines)

    with open(output_path, "w") as f:
        f.write(output)

    log.info("Wrote %s (%d items, %d failures)", output_path, len(combined.agenda_items), failures)

    if failures == len(chunks):
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description="Rover: harvest specification candidates and code from chat transcripts")
    parser.add_argument("--input", required=True, help="Path to input HTML chat transcript")
    parser.add_argument("--output", required=True, help="Path to output Markdown agenda")
    parser.add_argument("--model", default="qwen3.5:4b", help="Ollama model name (default: qwen3.5:4b)")
    parser.add_argument("--ollama-url", default="http://localhost:11434", help="Ollama server URL (default: http://localhost:11434)")
    args = parser.parse_args()

    exit_code = run_pipeline(args.input, args.output, model=args.model, ollama_url=args.ollama_url)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
