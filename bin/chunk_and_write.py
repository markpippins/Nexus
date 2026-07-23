#!/usr/bin/env python3
"""
Convert HTML → markdown (Docling), chunk (langchain), write chunks to files.
Also writes the full markdown.

Usage:
    source .venv/bin/activate
    python3 chunk_and_write.py --input /path/to/chat.html --outdir /tmp/chunks_wrp/
"""

import argparse
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", stream=sys.stderr)
log = logging.getLogger("chunk_and_write")


def process(input_path: str, outdir: str):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    
    base = Path(input_path).stem.replace(' ', '_')
    
    # Step 1: Docling
    from docling.document_converter import DocumentConverter
    log.info("Converting HTML → markdown via Docling...")
    converter = DocumentConverter()
    result = converter.convert(input_path)
    markdown = result.document.export_to_markdown()
    log.info("Docling produced %d characters", len(markdown))
    
    # Write full markdown
    md_path = out / f"{base}_full.md"
    with open(md_path, 'w') as f:
        f.write(markdown)
    log.info("Wrote full markdown: %s (%d chars)", md_path, len(markdown))
    
    # Step 2: Chunking
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=40000,
        chunk_overlap=4000,
        length_function=len,
    )
    chunks = splitter.split_text(markdown)
    log.info("Split into %d chunks", len(chunks))
    
    # Write each chunk to a file
    chunk_dir = out / "chunks"
    chunk_dir.mkdir(exist_ok=True)
    
    for i, chunk in enumerate(chunks):
        chunk_path = chunk_dir / f"chunk_{i+1:03d}_of_{len(chunks):03d}.md"
        header = f"# Chunk {i+1} of {len(chunks)}\n# Source: {base}\n# Size: {len(chunk)} chars\n\n"
        with open(chunk_path, 'w') as f:
            f.write(header + chunk)
    
    log.info("Wrote %d chunks to %s", len(chunks), chunk_dir)
    
    # Write manifest
    manifest = {
        "source": str(input_path),
        "base_name": base,
        "total_chars": len(markdown),
        "total_chunks": len(chunks),
        "chunk_dir": str(chunk_dir),
        "full_md": str(md_path)
    }
    import json
    manifest_path = out / "manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    log.info("Manifest: %s", manifest_path)
    
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--outdir", required=True)
    args = parser.parse_args()
    process(args.input, args.outdir)
