#!/usr/bin/env python3
"""HTML chat transcript importer.

Usage:
    python main.py <path>              # print NormalizedMessages to console
    python main.py <path> --json       # print JSON to stdout
    python main.py <path> --json -o out.json  # write JSON to file
    python main.py <path> --ocr        # enable OCR for image-based documents

<path> can be:
    - A single .html, .pdf, .docx, .md file
    - A directory (scanned recursively for supported files)
"""

import argparse
import json
import sys
from pathlib import Path

from docling_adapter import DoclingAdapter

# Import parsers so that @register_parser decorators fire
from parsers import chatgpt_parser   # noqa: F401
from parsers import copilot_parser    # noqa: F401
from parsers import gemini_parser     # noqa: F401
from parsers import markdown_parser   # noqa: F401
from parsers import opencode_parser   # noqa: F401

from base_parser import detect_and_parse
from models import NormalizedMessage, ConversationMetadata


SUPPORTED_SUFFIXES = (
    ".html", ".htm", ".md", ".markdown",
    ".pdf", ".docx", ".pptx", ".xlsx",
    ".epub", ".txt",
    ".png", ".jpg", ".jpeg", ".tiff",
)


def collect_ingest_files(path: Path) -> list[Path]:
    """Return a sorted list of supported files from a file or directory."""
    if path.is_file():
        if path.suffix.lower() in SUPPORTED_SUFFIXES:
            return [path]
        print(f"[html-importer] Skipping unsupported file: {path}", file=sys.stderr)
        return []

    if path.is_dir():
        files: list[Path] = []
        for suffix in SUPPORTED_SUFFIXES:
            files.extend(sorted(path.rglob(f"*{suffix}")))
            files.extend(sorted(path.rglob(f"*{suffix.upper()}")))
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

    print(f"[html-importer] Path not found: {path}", file=sys.stderr)
    return []


def parse_file(filepath: Path, adapter: DoclingAdapter) -> tuple[list[NormalizedMessage], ConversationMetadata]:
    """Parse a single file using DocLing and return (messages, metadata)."""
    if filepath.suffix.lower() in (".md", ".markdown"):
        from base_parser import detect_and_parse_md
        return detect_and_parse_md(filepath)

    try:
        result = adapter.convert(filepath)
        return detect_and_parse(result.document, filepath)
    except Exception as exc:
        print(f"[html-importer] ERROR parsing {filepath.name}: {exc}", file=sys.stderr, flush=True)
        file_ts = ConversationMetadata(export_source="unknown")
        return [], file_ts


def build_json_output(
    results: list[tuple[Path, list[NormalizedMessage], ConversationMetadata]],
) -> dict:
    """Build a JSON-serialisable structure from all parsed files."""
    files = []
    for filepath, messages, meta in results:
        entry: dict = {
            "file": str(filepath),
            "metadata": meta.to_dict() if hasattr(meta, "to_dict") else {},
            "messages": [m.to_dict() for m in messages],
        }
        files.append(entry)
    return {"files": files}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract normalised messages from saved chat transcripts (HTML, PDF, DOCX, MD, etc.)."
    )
    parser.add_argument(
        "path",
        help="A file or directory to scan for supported transcript files.",
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
        "--ocr",
        action="store_true",
        help="Enable OCR for image-based documents (requires EasyOCR/tesseract).",
    )
    parser.add_argument(
        "--mode",
        choices=["messages", "graph"],
        default="messages",
        help="Output mode. 'messages' for normalized flat messages, 'graph' for semantic graph IR.",
    )
    args = parser.parse_args()

    target = Path(args.path)
    ingest_files = collect_ingest_files(target)

    if not ingest_files:
        print(f"[html-importer] No supported files found at: {target}", file=sys.stderr)
        sys.exit(1)

    adapter = DoclingAdapter(enable_ocr=args.ocr)
    results: list[tuple[Path, list[NormalizedMessage], ConversationMetadata]] = []

    for filepath in ingest_files:
        messages, metadata = parse_file(filepath, adapter)
        results.append((filepath, messages, metadata))

    if args.mode == "graph":
        from graph_builder import GraphBuilder
        from graph_validator import GraphValidator
        from trajectory_reconstructor import TrajectoryReconstructor
        from trajectory_evaluation import TrajectoryEvaluator

        graphs_json = {"graphs": []}

        from workspace import Workspace
        workspace = Workspace(id="global_workspace")

        for filepath, messages, meta in results:
            graph_id = meta.conversation_id or f"conv_{filepath.name}"
            graph = GraphBuilder(graph_id).ingest_messages(messages).build_relationships().extract_trajectories().finalize()

            TrajectoryReconstructor(graph).reconstruct()

            from diff_engine import DiffEngine
            DiffEngine(graph).compute_diffs()

            from question_resolver import QuestionResolver
            QuestionResolver(graph).resolve()

            from observation_synthesizer import ObservationSynthesizer
            ObservationSynthesizer(graph).evaluate_diffs()

            from interaction_classifier import InteractionClassifier
            InteractionClassifier(graph).classify_diffs()

            from constraint_engine import ConstraintEngine
            ConstraintEngine(graph).validate_constraints()

            from conflict_detection import ConflictDetector
            ConflictDetector(graph).detect_conflicts()

            evaluations = TrajectoryEvaluator(graph).evaluate()

            from nexus_kernel import Kernel, FSMController
            from transition_synthesizer import TransitionSynthesizer
            from execution_gate import ExecutionEligibilityGate
            from ir_migration_layer import IRMigrationLayer

            event_stream = []
            for t in graph.reconstructed_trajectories.values():
                event_stream.extend(t.event_envelopes)

            migrator = IRMigrationLayer(synthesizer=TransitionSynthesizer())
            current_states = {}
            migrated_stream = migrator.migrate_batch(event_stream, current_states)

            kernel = Kernel(
                layer_c=ExecutionEligibilityGate(),
                fsm=FSMController()
            )
            kernel_result = kernel.run(migrated_stream, mode="LIVE")

            from replay_kernel import ReplayEngine
            replay_engine = ReplayEngine()
            run_id = f"run_{graph.id}_latest"
            view = replay_engine.replay(run_id, "v1", event_stream)

            if run_id not in graph.replay_views:
                graph.replay_views[run_id] = {}
            graph.replay_views[run_id]["v1"] = view
            graph.semantic_results[run_id] = view

            workspace.conversations[graph.id] = graph

            validator = GraphValidator(graph)
            validator.validate()

            if args.json:
                graph_dict = graph.to_dict()
                graphs_json["graphs"].append({
                    "file": str(filepath),
                    "graph": graph_dict,
                    "evaluations": {k: v.to_dict() for k, v in evaluations.items()},
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
                print(f"Evaluations: {len(evaluations)}")

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

        from context_assembler import ContextAssembler
        working_set, conflict_set = ContextAssembler(workspace).assemble()

        for graph_id, graph in workspace.conversations.items():
            print(f"[{graph_id}] Evaluated Kernel seamlessly statically.")

        if args.json:
            graphs_json["workspace"] = {
                "working_set": {
                    "resolved_concepts": list(working_set.resolved_concepts),
                    "resolves_edges": len(working_set.resolves_edges)
                },
                "conflict_set": {
                    "contradicted_concepts": list(conflict_set.contradicted_concepts),
                    "unresolved_questions": conflict_set.unresolved_questions,
                    "observations": len(conflict_set.observations)
                }
            }

        if args.json:
            json_str = json.dumps(graphs_json, indent=2, ensure_ascii=False)
            if args.output:
                Path(args.output).write_text(json_str, encoding="utf-8")
                print(f"[html-importer] JSON written to {args.output}", file=sys.stderr, flush=True)
            else:
                print(json_str, flush=True)

    else:
        if args.json:
            output = build_json_output(results)
            json_str = json.dumps(output, indent=2, ensure_ascii=False)
            if args.output:
                Path(args.output).write_text(json_str, encoding="utf-8")
                print(f"[html-importer] JSON written to {args.output}", file=sys.stderr, flush=True)
            else:
                print(json_str, flush=True)
        else:
            print(f"[html-importer] Processing {len(ingest_files)} file(s) from: {target}", flush=True)
            print("=" * 80, flush=True)
            total_messages = 0
            for filepath, messages, metadata in results:
                total_messages += len(messages)
                if metadata.title or metadata.conversation_id or metadata.model:
                    print(f"\nMetadata ({filepath.name}):", flush=True)
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
            print(f"[html-importer] Done. Total: {total_messages} message(s) from {len(ingest_files)} file(s).", flush=True)


if __name__ == "__main__":
    main()
