#!/usr/bin/env python3
"""HTML chat transcript importer.

Usage:
    python main.py <path>              # print NormalizedMessages to console
    python main.py <path> --json       # print JSON to stdout
    python main.py <path> --json -o out.json  # write JSON to file

<path> can be:
    - A single .html file
    - A directory (scanned recursively for .html files)
"""

import argparse
import json
import sys
import subprocess
from pathlib import Path


def _ensure_deps():
    """Auto-install dependencies if bs4 is not available."""
    try:
        import bs4  # noqa: F401
        return
    except ImportError:
        pass

    # Determine virtual environment executable locations based on OS
    venv_dir = Path(__file__).parent / "venv"
    # Windows uses Scripts, Unix uses bin
    if (venv_dir / "Scripts" / "pip.exe").exists():
        venv_pip = venv_dir / "Scripts" / "pip.exe"
        venv_python = venv_dir / "Scripts" / "python.exe"
    elif (venv_dir / "bin" / "pip").exists():
        venv_pip = venv_dir / "bin" / "pip"
        venv_python = venv_dir / "bin" / "python"
    else:
        venv_pip = None
        venv_python = None

    if venv_pip and venv_pip.exists():
        subprocess.check_call([
            str(venv_pip), "install", "-q", "-r",
            str(Path(__file__).parent / "requirements.txt")
        ])
        if venv_python and venv_python.exists() and str(venv_python) != str(sys.executable):
            raise SystemExit(subprocess.call([str(venv_python)] + sys.argv))
    else:
        # Fallback to system pip
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "-q",
            "-r", str(Path(__file__).parent / "requirements.txt")
        ])


_ensure_deps()

from bs4 import BeautifulSoup

# Import parsers so that @register_parser decorators fire
from parsers import chatgpt_parser   # noqa: F401
from parsers import copilot_parser    # noqa: F401
# from parsers import gemini_parser    # DEPRECATED: commented out - https://linear.app/TODO
from parsers import markdown_parser   # noqa: F401

from base_parser import detect_and_parse
from models import NormalizedMessage, ConversationMetadata


def collect_html_files(path: Path) -> list[Path]:
    """Return a sorted list of .html / .htm / .md files from a file or directory."""
    if path.is_file():
        if path.suffix.lower() in (".html", ".htm", ".md", ".markdown"):
            return [path]
        print(f"[html_importer] Skipping unsupported file: {path}", file=sys.stderr)
        return []

    if path.is_dir():
        files = sorted(path.rglob("*.html"))
        files += sorted(path.rglob("*.htm"))
        files += sorted(path.rglob("*.md"))
        files += sorted(path.rglob("*.markdown"))
        seen = set()
        deduped = []
        for f in files:
            resolved = f.resolve()
            if any(part.endswith("_files") for part in resolved.parts):
                continue
            if resolved not in seen:
                seen.add(resolved)
                deduped.append(f)
        return deduped

    print(f"[html_importer] Path not found: {path}", file=sys.stderr)
    return []


def parse_file(filepath: Path) -> tuple[list[NormalizedMessage], ConversationMetadata]:
    """Parse a single HTML or Markdown file and return (messages, metadata)."""
    if filepath.suffix.lower() in (".md", ".markdown"):
        # Markdown files don't need BeautifulSoup
        from base_parser import detect_and_parse_md
        return detect_and_parse_md(filepath)

    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        html_content = f.read()

    soup = BeautifulSoup(html_content, "lxml")
    return detect_and_parse(soup, filepath)


def build_json_output(
    results: list[tuple[Path, list[NormalizedMessage], ConversationMetadata]],
) -> dict:
    """Build a JSON-serialisable structure from all parsed files."""
    files = []
    for filepath, messages, meta in results:
        entry: dict = {
            "file": str(filepath),
            "metadata": meta.to_dict(),
            "messages": [m.to_dict() for m in messages],
        }
        files.append(entry)
    return {"files": files}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract normalised messages from saved HTML chat transcripts."
    )
    parser.add_argument(
        "path",
        help="An HTML file or a directory to scan for .html / .htm files.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON to stdout (or to a file with -o).",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Write JSON output to this file instead of stdout.",
    )
    parser.add_argument(
        "--mode",
        choices=["messages", "graph"],
        default="messages",
        help="Output mode. 'messages' for normalized flat messages, 'graph' for semantic graph IR.",
    )
    args = parser.parse_args()

    target = Path(args.path)
    html_files = collect_html_files(target)

    if not html_files:
        print(f"[html_importer] No HTML files found at: {target}", file=sys.stderr)
        sys.exit(1)

    results: list[tuple[Path, list[NormalizedMessage], ConversationMetadata]] = []

    for filepath in html_files:
        messages, metadata = parse_file(filepath)
        results.append((filepath, messages, metadata))

    if args.mode == "graph":
        from graph_builder import GraphBuilder
        from graph_validator import GraphValidator
        from trajectory_reconstructor import TrajectoryReconstructor
        from trajectory_evaluator import TrajectoryEvaluator
        
        graphs_json = {"graphs": []}

        for filepath, messages, meta in results:
            graph_id = meta.conversation_id or f"conv_{filepath.name}"
            # Generates Pass 1-3
            graph = GraphBuilder(graph_id).ingest_messages(messages).build_relationships().extract_trajectories().finalize()
            
            # Pass 4: Reconstruction semantic annotations
            TrajectoryReconstructor(graph).reconstruct()
            
            # Pass 4.5: Core validation classifications
            TrajectoryEvaluator().evaluate(graph)
            
            # Final validation layout assertion backstop
            validator = GraphValidator(graph)
            validator.validate()
            
            if args.json:
                graphs_json["graphs"].append({
                    "file": str(filepath),
                    "graph": graph.to_dict(),
                    "validation": {
                        "errors": validator.errors,
                        "warnings": validator.warnings
                    }
                })
            else:
                print(f"--- Graph Diagnostics for {filepath.name} ---")
                print(f"Messages input: {len(messages)}")
                print(f"Nodes: {len(graph.messages)}")
                print(f"Relationships: {len(graph.relationships)}")
                print(f"Concepts: {len(graph.concepts)}")
                print(f"Trajectories: {len(graph.trajectories)}")
                
                if validator.errors or validator.warnings:
                    print("-" * 45)
                    for err in validator.errors:
                        print(f"[ERROR] {err}")
                    for warn in validator.warnings:
                        print(f"[WARN] {warn}")
                    print(f"Validation failed: {len(validator.errors)} errors, {len(validator.warnings)} warnings")
                else:
                    print("[OK] Validation passed cleanly.")
                print("---------------------------------------------")

        if args.json:
            json_str = json.dumps(graphs_json, indent=2, ensure_ascii=False)
            if args.output:
                Path(args.output).write_text(json_str, encoding="utf-8")
                print(f"[html_importer] JSON written to {args.output}", file=sys.stderr, flush=True)
            else:
                print(json_str, flush=True)
                
    else:
        if args.json:
            output = build_json_output(results)
            json_str = json.dumps(output, indent=2, ensure_ascii=False)
            if args.output:
                Path(args.output).write_text(json_str, encoding="utf-8")
                print(f"[html_importer] JSON written to {args.output}", file=sys.stderr, flush=True)
            else:
                print(json_str, flush=True)
        else:
            print(f"[html_importer] Processing {len(html_files)} file(s) from: {target}", flush=True)
            print("=" * 80, flush=True)
            total_messages = 0
            for filepath, messages, metadata in results:
                total_messages += len(messages)
                if metadata.title or metadata.conversation_id or metadata.model:
                    print(f"\n📋 Metadata ({filepath.name}):", flush=True)
                    if metadata.title: print(f"   Title:    {metadata.title}", flush=True)
                    if metadata.conversation_id: print(f"   Conv ID:  {metadata.conversation_id}", flush=True)
                    if metadata.model: print(f"   Model:    {metadata.model}", flush=True)
                    if metadata.create_time: print(f"   Created:  {metadata.create_time}", flush=True)
                    if metadata.update_time: print(f"   Updated:  {metadata.update_time}", flush=True)
                    print(flush=True)

                for msg in messages:
                    print("-" * 80, flush=True)
                    print(msg, flush=True)

            print("=" * 80, flush=True)
            print(f"[html_importer] Done. Total: {total_messages} message(s) from {len(html_files)} file(s).", flush=True)


if __name__ == "__main__":
    main()
