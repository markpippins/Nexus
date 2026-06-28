#!/usr/bin/env python3
"""
WRP Kernel Replay CLI — reconstruct KernelState at any version via KSRA.

Usage:
    python cli/replay.py                    # Latest version
    python cli/replay.py --version 42       # Specific version
    python cli/replay.py --compare 42       # Compare live vs replay
"""

import json
import sys
import argparse

# Ensure app/ is importable
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))


def main():
    parser = argparse.ArgumentParser(description="Reconstruct KernelState via KSRA")
    parser.add_argument("--version", type=int, default=None,
                        help="Target version (default: latest)")
    parser.add_argument("--compare", type=int, default=None,
                        help="Version to compare live vs replay")
    parser.add_argument("--pretty", action="store_true",
                        help="Pretty-print JSON output")
    args = parser.parse_args()

    indent = 2 if args.pretty else None

    if args.compare is not None:
        from app.services.replay_service import compare
        result = compare(args.compare)
        print(json.dumps(result, indent=indent))
        sys.exit(0 if result["match"] else 1)

    from app.services.replay_service import replay
    state = replay(target_version=args.version)

    summary = {
        "version": state.version,
        "plan_count": len(state.plans),
        "receipt_count": len(state.receipts),
        "identity_count": state.identity.known_count(),
        "graph_edge_count": state.graph.edge_count(),
        "lineage_event_count": state.lineage.event_count(),
    }
    print(json.dumps(summary, indent=indent))


if __name__ == "__main__":
    main()
