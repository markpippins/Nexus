#!/usr/bin/env python3
"""
Epistemologist — Concept Extractor (Plan 1281).

Layer-2 concept/relationship/evidence extraction on audit data.
Reads source_observations produced by the Auditor and extracts structured
knowledge into the semantics schema.

Usage:
    python -m epistemologist.main [--role epistemologist] [--limit N] [--dry-run]

Environment:
    EPISTEMOLOGIST_PG_DSN   PostgreSQL DSN (default: conduit's DSN)
    TACKLE_MCP_URL          tackle-mcp URL for LLM config resolution
"""

import argparse
import logging
import os
import sys

# Ensure nexus/python is on the path so tackle.inference can be imported
_NEXUS_PYTHON = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

from epistemologist.extractor import process_observations

_log = logging.getLogger("epistemologist")


def main():
    parser = argparse.ArgumentParser(
        description="Epistemologist — Concept Extractor (Plan 1281)"
    )
    parser.add_argument(
        "--role", default="epistemologist",
        help="Role name for LLM config resolution (default: epistemologist)"
    )
    parser.add_argument(
        "--limit", type=int, default=50,
        help="Max source_observations to process (default: 50)"
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

    _log.info("=== Epistemologist starting ===")
    _log.info("Role: %s  Limit: %d  Dry-run: %s", args.role, args.limit, args.dry_run)

    results = process_observations(
        limit=args.limit,
        role=args.role,
        dry_run=args.dry_run,
    )

    _log.info("=== Epistemologist complete ===")
    _log.info(
        "Observations: %d  Concepts: %d  Relationships: %d  Evidence: %d  Errors: %d  Skipped: %d",
        results["observations"], results["concepts"], results["relationships"],
        results["evidence"], results["errors"], results["skipped"],
    )

    if results["errors"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
