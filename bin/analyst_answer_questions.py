#!/usr/bin/env python3
"""
analyst_answer_questions.py — Analyst Cron: Answer open questions

Processes OPEN questions with no answer (answered_by IS NULL):
  1. Fetches up to `limit` unanswered questions
  2. Builds context for each (requirement, candidate, similar answers)
  3. Invokes LLM to produce answers
  4. Records answers via nebula_answer_question (status stays OPEN)

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate

    # Answer all unanswered questions (up to limit)
    python3 bin/analyst_answer_questions.py

    # Answer a specific number
    python3 bin/analyst_answer_questions.py --limit 3

    # Dry run (no LLM call, no DB writes)
    python3 bin/analyst_answer_questions.py --dry-run
"""

import argparse
import json
import logging
import sys
import os

# Add parent directory to path so tackle.harness is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import psycopg2

from tackle.harness import AnalystHarness

log = logging.getLogger("analyst")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)

PG_DSN = "postgresql://pguser:pgpass@localhost:5432/nexus"


def main():
    parser = argparse.ArgumentParser(description="Answer open questions")
    parser.add_argument("--limit", type=int, default=5, help="Max questions to answer")
    parser.add_argument("--dry-run", action="store_true", help="No LLM call, no DB writes")
    args = parser.parse_args()

    log.info("Starting analyst cycle (limit=%d, dry_run=%s)", args.limit, args.dry_run)

    try:
        conn = psycopg2.connect(PG_DSN)
    except Exception as e:
        log.error("Failed to connect to database: %s", e)
        sys.exit(1)

    try:
        harness = AnalystHarness(conn)
        result = harness.run_cycle(limit=args.limit)

        log.info("Cycle result: %s", json.dumps(result, indent=2, default=str))

        # Print completion envelope for cron monitoring
        envelope = result.get("completion_envelope")
        if envelope:
            log.info("Completion envelope: %s", json.dumps(envelope, default=str))
        else:
            log.warning("No completion envelope — inference may have failed")

        return 0 if envelope else 1

    except Exception as e:
        log.error("Cycle failed: %s", e, exc_info=True)
        return 1

    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
