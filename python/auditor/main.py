#!/usr/bin/env python3
"""
Auditor — Claim Extractor.

Layer-1 typed claim extraction on conversation transcripts.
Reads raw transcript source_observations (asset kind 'transcript') and
extracts typed claims (file_change, api_change, bug_fix, design_decision,
tradeoff, blocker) into the semantics schema.

Usage:
    python -m auditor.main [--role auditor] [--limit N] [--dry-run]

Environment:
    AUDITOR_PG_DSN   PostgreSQL DSN (default: conduit's DSN)
    TACKLE_MCP_URL   tackle-mcp URL for LLM config resolution
"""

import argparse
import importlib
import logging
import os
import sys

# Ensure nexus/python is on the path so tackle.inference can be imported
_NEXUS_PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

# The module is named claim-extractor.py (hyphenated, matching the repo
# convention claim-extractor-harness.sh / claim-extractor-role-prompt.md),
# so it must be loaded via importlib — a hyphen is not a valid identifier
# in a regular `import` statement.
_CLAIM_EXTRACTOR = importlib.import_module("auditor.claim-extractor")

_log = logging.getLogger("auditor")


def main():
    parser = argparse.ArgumentParser(
        description="Auditor — Claim Extractor"
    )
    parser.add_argument(
        "--role", default="auditor",
        help="Role name for LLM config resolution (default: auditor)"
    )
    parser.add_argument(
        "--limit", type=int, default=50,
        help="Max transcript source_observations to process (default: 50)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Report what would be processed without making LLM calls or DB writes"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Verbose logging"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    _log.info("=== Auditor starting ===")
    _log.info("Role: %s  Limit: %d  Dry-run: %s", args.role, args.limit, args.dry_run)

    results = _CLAIM_EXTRACTOR.process_transcripts(
        limit=args.limit,
        role=args.role,
        dry_run=args.dry_run,
    )

    _log.info("=== Auditor complete ===")
    _log.info(
        "Observations: %d  Claims: %d  Errors: %d  Skipped: %d",
        results["observations"], results["claims"],
        results["errors"], results["skipped"],
    )

    if results["errors"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
