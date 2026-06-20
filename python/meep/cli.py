#!/usr/bin/env python3
"""MEEP CLI — run the minimal end-to-end pipeline from a prompt.

Usage:
    echo "hello" | python -m meep.cli
    python -m meep.cli "fix the bug in ServiceBroker"
    python -m meep.cli --help

Pipeline stations (Phase 1 vertical slice):
  1. IRL classifier    — keyword-based heuristic → probability distribution
  2. IR resolver       — argmax → deterministic archetype selection
  3. Spec compiler     — archetype → WorkRequestGraph (small DAG)
  4. Lowering pass     — freeze → immutable ExecutionGraph
  5. Scheduler         — deterministic loop → CER event log
  6. Replay engine     — pure reducer → ExecutionState
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(
        description="MEEP — Minimal End-to-End Pipeline (Phase 1 v0.1)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Pipeline stations:\n"
            "  1. IRL classifier    → probability distribution\n"
            "  2. IR resolver       → deterministic archetype\n"
            "  3. Spec compiler     → WorkRequestGraph\n"
            "  4. Lowering pass     → frozen ExecutionGraph\n"
            "  5. Scheduler         → CER event log\n"
            "  6. Replay engine     → ExecutionState (--replay)\n"
            "\n"
            "Phase 0 freeze active — no new archetypes or types."
        ),
    )
    parser.add_argument(
        "prompt",
        nargs="*",
        help="Prompt text (if omitted, read from stdin)",
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default="",
        help="Path to write the CER event log as JSON (default: stdout)",
    )
    parser.add_argument(
        "--replay",
        action="store_true",
        help="Also replay the event log and print ExecutionState",
    )
    parser.add_argument(
        "--version",
        action="store_true",
        help="Print version and exit",
    )
    return parser.parse_args(argv)


def read_prompt(args: argparse.Namespace) -> str:
    """Read the prompt from args or stdin."""
    if args.prompt:
        return " ".join(args.prompt)
    if not sys.stdin.isatty():
        return sys.stdin.read().strip()
    return ""


def main(argv: Optional[list[str]] = None) -> int:
    """CLI entrypoint.  Returns exit code."""
    args = parse_args(argv)

    if args.version:
        from meep import __version__
        print(f"MEEP v{__version__}")
        return 0

    prompt = read_prompt(args)
    if not prompt:
        print("No prompt provided. Pipe text or pass as arguments.", file=sys.stderr)
        print(f"Usage: echo 'hello' | {sys.argv[0]}", file=sys.stderr)
        return 1

    # Run the full pipeline
    from meep.pipeline import run_pipeline, run_and_replay

    if args.replay:
        log, state = run_and_replay(prompt)
    else:
        log = run_pipeline(prompt)

    # Serialise the CER log as JSON
    serialised = _serialise_log(log)

    cer_path = args.output
    if cer_path:
        Path(cer_path).write_text(serialised, encoding="utf-8")
        print(f"CER log written to {cer_path}", file=sys.stderr)
        if args.replay:
            print(f"Final state: {state}", file=sys.stderr)  # noqa: F821
    else:
        print(serialised)

    return 0


def _serialise_log(log) -> str:
    """Serialise a CERLog to a JSON array of event dicts."""
    import json
    records = []
    for event in log.events:
        records.append({
            "event_id": event.event_id,
            "timestamp": event.timestamp,
            "execution_id": event.execution_id,
            "node_id": event.node_id,
            "event_type": event.event_type,
            "payload": event.payload,
            "prev_event_hash": event.prev_event_hash,
        })
    return json.dumps(records, indent=2)


if __name__ == "__main__":
    sys.exit(main())
