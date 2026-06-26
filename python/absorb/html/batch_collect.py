#!/usr/bin/env python3
"""
Batch collector: runs the full pipeline over real transcripts, collects
structural metadata, and reports stability + sanity checks.

Uses DoclingAdapter to convert HTML/markdown files to DoclingDocuments,
then feeds them through the parser pipeline.

Usage:
    python batch_collect.py [--transcripts DIR] [--runs N]
"""

import argparse
import json
import hashlib
import sys
import time
from collections import Counter
from pathlib import Path

# Import parsers at module level so @register_parser decorators fire once
from parsers import chatgpt_parser     # noqa: F401
from parsers import copilot_parser      # noqa: F401
from parsers import opencode_parser     # noqa: F401
from parsers import gemini_parser       # noqa: F401
from parsers import markdown_parser     # noqa: F401


def _get_adapter():
    """Get a DoclingAdapter, raising a clear error if docling is not installed."""
    try:
        from docling_adapter import DoclingAdapter
        return DoclingAdapter(enable_ocr=False)
    except ImportError as e:
        print(f"[batch] ERROR: {e}", file=sys.stderr)
        print("[batch] Docling is required but not installed.", file=sys.stderr)
        print("[batch] Install it with: pip install docling", file=sys.stderr)
        sys.exit(1)


def collect_stats(filepath: Path, adapter) -> dict:
    """Run the pipeline on one transcript and extract structural stats."""
    from base_parser import (
        detect_and_parse, detect_and_parse_md,
    )
    from graph_builder import GraphBuilder
    from graph_validator import GraphValidator
    from trajectory_reconstructor import TrajectoryReconstructor
    from trajectory_evaluation import TrajectoryEvaluator
    from diff_engine import DiffEngine
    from question_resolver import QuestionResolver
    from observation_synthesizer import ObservationSynthesizer
    from interaction_classifier import InteractionClassifier
    from constraint_engine import ConstraintEngine
    from conflict_detection import ConflictDetector
    from nexus_kernel import Kernel, FSMController
    from transition_synthesizer import TransitionSynthesizer
    from execution_gate import ExecutionEligibilityGate
    from ir_migration_layer import IRMigrationLayer
    from replay_kernel import ReplayEngine
    from context_assembler import ContextAssembler
    from workspace import Workspace

    # Convert using DocLing
    try:
        if filepath.suffix.lower() in (".md", ".markdown"):
            # Raw markdown files don't go through DocLing conversion
            messages, meta = detect_and_parse_md(filepath)
        else:
            result = adapter.convert(filepath)
            messages, meta = detect_and_parse(result.document, filepath)
    except Exception as e:
        return {"file": filepath.name, "transcript_id": filepath.stem, "error": f"DocLing convert: {e}"}

    transcript_id = meta.conversation_id or filepath.stem
    msg_count = len(messages)

    if msg_count == 0:
        return {"file": filepath.name, "transcript_id": transcript_id, "error": "no_messages"}

    # Build graph pipeline
    graph = GraphBuilder(transcript_id).ingest_messages(messages).build_relationships().extract_trajectories().finalize()
    TrajectoryReconstructor(graph).reconstruct()
    DiffEngine(graph).compute_diffs()
    QuestionResolver(graph).resolve()
    synth = ObservationSynthesizer(graph)
    try:
        synth.evaluate_diffs()
    except Exception as e:
        return {"file": filepath.name, "transcript_id": transcript_id, "error": f"ObservationSynthesizer: {e}"}
    try:
        InteractionClassifier(graph).classify_diffs()
    except Exception as e:
        return {"file": filepath.name, "transcript_id": transcript_id, "error": f"InteractionClassifier: {e}"}
    try:
        ConstraintEngine(graph).validate_constraints()
    except Exception as e:
        return {"file": filepath.name, "transcript_id": transcript_id, "error": f"ConstraintEngine: {e}"}
    try:
        ConflictDetector(graph).detect_conflicts()
    except Exception as e:
        return {"file": filepath.name, "transcript_id": transcript_id, "error": f"ConflictDetector: {e}"}
    evaluations = TrajectoryEvaluator(graph).evaluate()

    # Kernel + Replay
    event_stream = []
    for t in graph.reconstructed_trajectories.values():
        event_stream.extend(t.event_envelopes)

    migrator = IRMigrationLayer(synthesizer=TransitionSynthesizer())
    migrated_stream = migrator.migrate_batch(event_stream, {})
    kernel = Kernel(layer_c=ExecutionEligibilityGate(), fsm=FSMController())
    kernel_result = kernel.run(migrated_stream, mode="LIVE")

    replay_engine = ReplayEngine()
    view = replay_engine.replay(f"run_{transcript_id}", "v1", event_stream)

    # Workspace assembly
    workspace = Workspace(id="batch")
    graph.semantic_results[f"run_{transcript_id}"] = view
    workspace.conversations[transcript_id] = graph

    try:
        working_set, conflict_set = ContextAssembler(workspace).assemble()
    except Exception as e:
        return {"file": filepath.name, "transcript_id": transcript_id, "error": f"ContextAssembler: {e}"}

    # Validate
    validator = GraphValidator(graph)
    validator.validate()

    projection = view.semantic_projection

    # Structural graph hash: deterministic concatenation of graph identity
    graph_hash_input = "|".join(sorted(graph.messages.keys()))
    graph_hash_input += "|||" + "|".join(
        f"{r.source_id}->{r.target_id}:{r.relation_type}"
        for r in sorted(getattr(graph, 'relationships', []), key=lambda x: (x.source_id, x.target_id))
    )
    graph_hash_input += "|||" + "|".join(sorted(graph.concepts.keys()))
    graph_hash_input += "|||" + "|".join(sorted(getattr(graph, 'trajectories', {}).keys()))
    graph_hash = hashlib.sha256(graph_hash_input.encode()).hexdigest()

    # CCNF-like hash: deterministic summary of the semantic projection
    ccnf_input = "concepts:" + ",".join(sorted(projection.resolved_concepts))
    ccnf_input += "|edges:" + ",".join(
        f"{s}->{t}" for s, t in sorted(projection.resolves_edges)
    )
    ccnf_hash = hashlib.sha256(ccnf_input.encode()).hexdigest()

    return {
        "file": filepath.name,
        "transcript_id": transcript_id,
        "messages": msg_count,
        "nodes": len(graph.messages),
        "relationships": len(graph.relationships),
        "concepts": len(graph.concepts),
        "trajectories": len(graph.trajectories),
        "reconstructed_trajectories": len(graph.reconstructed_trajectories) if hasattr(graph, 'reconstructed_trajectories') else 0,
        "trajectory_states": dict(view.trajectory_states) if view.trajectory_states else {},
        "questions": len(graph.questions),
        "observations": len(graph.observations),
        "resolved_concepts": len(projection.resolved_concepts),
        "resolve_edges": len(projection.resolves_edges),
        "working_set_resolved": len(working_set.resolved_concepts),
        "working_set_edges": len(working_set.resolves_edges),
        "conflict_contradictions": len(conflict_set.contradicted_concepts),
        "conflict_unresolved": len(conflict_set.unresolved_questions),
        "conflict_observations": len(conflict_set.observations),
        "validation_errors": len(validator.errors),
        "validation_warnings": len(validator.warnings),
        "evaluations": {k: v.to_dict() if hasattr(v, 'to_dict') else str(v) for k, v in evaluations.items()},
        "graph_hash": graph_hash,
        "ccnf_hash": ccnf_hash,
    }


def run_batch(transcripts_dir: str, runs: int = 2):
    """Run batch collection with N runs per transcript for stability check."""
    transcripts_dir = Path(transcripts_dir)
    html_files = sorted(
        transcripts_dir.glob("*.html"),
        key=lambda p: (p.stat().st_size, p.name),
    )

    print(f"Collecting stats from {len(html_files)} transcripts ({runs} runs each)...")
    print()

    adapter = _get_adapter()

    all_runs = []
    for filepath in html_files:
        run_data = []
        for r in range(runs):
            try:
                stats = collect_stats(filepath, adapter)
                stats["run"] = r
                run_data.append(stats)
            except Exception as e:
                run_data.append({
                    "file": filepath.name,
                    "run": r,
                    "error": str(e),
                })
        all_runs.append(run_data)

    # Report
    print("=" * 80)
    print("BATCH COLLECTION REPORT")
    print("=" * 80)
    print()

    # Summary table
    headers = ["File", "Msgs", "Trajs", "RTrajs", "Concepts", "Resolved", "Edges", "Q", "Obs", "VErr", "VWarn"]
    print("  ".join(h.ljust(12) for h in headers))
    print("-" * 120)

    trajectory_spreads = []
    zero_resolved = []
    multi_traj_files = []
    single_traj_files = []
    unstable = []
    validation_failures = []

    for run_data in all_runs:
        r0 = run_data[0]
        file_label = r0.get("file", "???")[:20]

        if "error" in r0:
            print(f"  {file_label.ljust(20)}  ERROR: {r0['error']}")
            continue

        msgs = r0.get("messages", 0)
        trajs = r0.get("trajectories", 0)
        rtrajs = r0.get("reconstructed_trajectories", 0)
        concepts = r0.get("concepts", 0)
        resolved = r0.get("resolved_concepts", 0)
        edges = r0.get("resolve_edges", 0)
        q = r0.get("questions", 0)
        obs = r0.get("observations", 0)
        verr = r0.get("validation_errors", 0)
        vwarn = r0.get("validation_warnings", 0)

        print(f"  {file_label.ljust(20)} {str(msgs).ljust(8)} {str(trajs).ljust(8)} {str(rtrajs).ljust(8)} {str(concepts).ljust(8)} {str(resolved).ljust(8)} {str(edges).ljust(8)} {str(q).ljust(4)} {str(obs).ljust(6)} {str(verr).ljust(6)} {str(vwarn).ljust(6)}")

        # Track anomalies
        if trajs == 1:
            single_traj_files.append(r0.get("file", "?"))
        if trajs > 20:
            trajectory_spreads.append((r0.get("file", "?"), trajs))
        if resolved == 0 and msgs > 0:
            zero_resolved.append(r0.get("file", "?"))
        if rtrajs > 5:
            multi_traj_files.append(r0.get("file", "?"))
        if verr > 0 or vwarn > 0:
            validation_failures.append((r0.get("file", "?"), verr, vwarn))

        # Stability check
        if len(run_data) >= 2:
            r1 = run_data[1]
            if "error" not in r1:
                for key in ["trajectories", "resolved_concepts", "resolve_edges", "concepts", "nodes", "relationships"]:
                    if r0.get(key) != r1.get(key):
                        unstable.append((r0.get("file", "?"), key, r0.get(key), r1.get(key)))

    print()
    print("=" * 80)
    print("ANOMALIES")
    print("=" * 80)

    if single_traj_files:
        print(f"\n⚠️  trajectory_count = 1 ({len(single_traj_files)} files):")
        for f in single_traj_files[:10]:
            print(f"    - {f}")
        if len(single_traj_files) > 10:
            print(f"    ... and {len(single_traj_files) - 10} more")

    if trajectory_spreads:
        print(f"\n⚠️  trajectory_count > 20 ({len(trajectory_spreads)} files):")
        for f, c in trajectory_spreads[:5]:
            print(f"    - {f} ({c} trajectories)")
        if len(trajectory_spreads) > 5:
            print(f"    ... and {len(trajectory_spreads) - 5} more")

    if zero_resolved:
        print(f"\n⚠️  resolved_concepts = 0 ({len(zero_resolved)} files):")
        for f in zero_resolved[:10]:
            print(f"    - {f}")
        if len(zero_resolved) > 10:
            print(f"    ... and {len(zero_resolved) - 10} more")

    if multi_traj_files:
        print(f"\n⚠️  reconstructed_trajectories > 5 ({len(multi_traj_files)} files):")
        for f in multi_traj_files[:5]:
            print(f"    - {f}")
        if len(multi_traj_files) > 5:
            print(f"    ... and {len(multi_traj_files) - 5} more")

    if unstable:
        print(f"\n⚠️  Unstable across runs ({len(unstable)} discrepancies):")
        by_file = Counter(u[0] for u in unstable)
        for f, count in by_file.most_common(5):
            print(f"    - {f} ({count} field mismatches)")
        if len(by_file) > 5:
            print(f"    ... and {len(by_file) - 5} more files")

    if validation_failures:
        print(f"\n⚠️  Validation failures ({len(validation_failures)} files):")
        for f, errs, warns in validation_failures[:10]:
            print(f"    - {f} ({errs} errors, {warns} warnings)")
        if len(validation_failures) > 10:
            print(f"    ... and {len(validation_failures) - 10} more")

    if not any([single_traj_files, trajectory_spreads, zero_resolved, multi_traj_files, unstable, validation_failures]):
        print("\n✅ No anomalies detected.")

    # Overall summary
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    ok = [r for rd in all_runs for r in rd if "error" not in r]
    errs = [r for rd in all_runs for r in rd if "error" in r]
    print(f"  Total transcripts:     {len(html_files)}")
    print(f"  Successful runs:       {len(ok)}")
    print(f"  Failed runs:           {len(errs)}")
    if ok:
        avg_trajs = sum(r.get("trajectories", 0) for r in ok) / len(ok)
        avg_resolved = sum(r.get("resolved_concepts", 0) for r in ok) / len(ok)
        avg_edges = sum(r.get("resolve_edges", 0) for r in ok) / len(ok)
        total_errors = sum(r.get("validation_errors", 0) for r in ok)
        total_warnings = sum(r.get("validation_warnings", 0) for r in ok)
        print(f"  Avg trajectories:      {avg_trajs:.1f}")
        print(f"  Avg resolved_concepts: {avg_resolved:.1f}")
        print(f"  Avg resolve_edges:     {avg_edges:.1f}")
        print(f"  Total validation errs: {total_errors}")
        print(f"  Total validation warn: {total_warnings}")
        print(f"  Stability failures:    {len(unstable)}")
    print()

    return all_runs


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Collect batch pipeline stats from real transcripts")
    parser.add_argument("--transcripts", default="transcripts", help="Path to transcripts directory")
    parser.add_argument("--runs", type=int, default=2, help="Number of runs per transcript (default: 2)")
    parser.add_argument("--output", "-o", help="Save full stats to JSON file")
    args = parser.parse_args()

    all_runs = run_batch(args.transcripts, runs=args.runs)

    if args.output:
        with open(args.output, "w") as f:
            json.dump(all_runs, f, indent=2, default=str)
        print(f"\nFull stats written to {args.output}")
