#!/usr/bin/env python3
"""
cpf_query.py — Query ready candidates for UI consumption

Outputs candidates sorted by compilation_readiness as JSON,
ready for the DeepSeek team to hook into the frontend.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/cpf_query.py                          # all ready candidates (CPF >= 0.7)
    python3 bin/cpf_query.py --threshold 0.5           # custom threshold
    python3 bin/cpf_query.py --candidate <uuid>        # single candidate detail
    python3 bin/cpf_query.py --all                     # all candidates regardless of readiness
    python3 bin/cpf_query.py --json                    # JSON output (for API consumers)
    python3 bin/cpf_query.py --count                   # just the count

The --json output is designed for the DeepSeek UI: it includes candidate title,
intent_description, readiness score, component breakdown, system/subsystem names,
dependency count, and a 'promotable' boolean (CPF >= 0.7 with resolved deps).
"""

import argparse
import json
import logging
import subprocess
import sys

log = logging.getLogger("cpf_query")

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


def psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def fetch_ready(threshold: float = 0.7, all_candidates: bool = False,
                candidate_id: str | None = None) -> list[dict]:
    where_parts = []
    if candidate_id:
        where_parts.append(f"hc.id = '{candidate_id}'")
    elif not all_candidates:
        where_parts.append(f"hc.compilation_readiness >= {threshold}")

    where_sql = ""
    if where_parts:
        where_sql = "WHERE " + " AND ".join(where_parts)

    sql = f"""
        SELECT row_to_json(r)::text FROM (
            SELECT
                hc.id,
                hc.title,
                hc.intent_description,
                hc.status,
                hc.compilation_readiness,
                hc.completed,
                hc.tags,
                COALESCE(sys.name, '(none)') AS system_name,
                COALESCE(sub.name, '(none)') AS subsystem_name,
                (SELECT count(*) FROM nebula.candidate_dependencies cd WHERE cd.candidate_id = hc.id) AS dep_count
            FROM nebula.harvest_candidates hc
            LEFT JOIN nebula.systems sys ON sys.id = hc.system_id
            LEFT JOIN nebula.subsystems sub ON sub.id = hc.subsystem_id
            {where_sql}
            ORDER BY hc.compilation_readiness DESC NULLS LAST, hc.created_at DESC
        ) r;
    """
    rc, out = psql(sql)
    if rc != 0 or not out:
        return []

    candidates = []
    for line in out.splitlines():
        if not line:
            continue
        try:
            c = json.loads(line)
        except json.JSONDecodeError:
            continue
        c["tags"] = c.get("tags") or []
        c["promotable"] = c.get("compilation_readiness") is not None and c["compilation_readiness"] >= 0.7
        candidates.append(c)
    return candidates


def main():
    parser = argparse.ArgumentParser(description="Query ready candidates by CPF")
    parser.add_argument("--threshold", type=float, default=0.7,
                        help="Readiness threshold (default: 0.7)")
    parser.add_argument("--candidate", type=str, default=None,
                        help="Show detail for a specific candidate UUID")
    parser.add_argument("--all", action="store_true",
                        help="Show all candidates regardless of readiness")
    parser.add_argument("--json", action="store_true",
                        help="Output JSON (for API consumers)")
    parser.add_argument("--count", action="store_true",
                        help="Just show the count of ready candidates")
    args = parser.parse_args()

    candidates = fetch_ready(
        threshold=args.threshold,
        all_candidates=args.all,
        candidate_id=args.candidate,
    )

    if args.count:
        print(len(candidates))
        return 0

    if args.json:
        print(json.dumps(candidates, indent=2, ensure_ascii=False))
        return 0

    # Human-readable output
    if not candidates:
        log.info("No candidates found.")
        return 0

    log.info("Candidates (CPF >= %.1f): %d", args.threshold, len(candidates))
    log.info("─" * 60)
    for c in candidates:
        score = c["compilation_readiness"]
        score_str = f"{score:.3f}" if score is not None else "N/A  "
        flag = "⚡" if c["promotable"] else " "
        log.info(
            "  %s %s  CPF=%s  [%s / %s]  deps=%d  %s",
            flag,
            c["id"][:8],
            score_str,
            c["system_name"],
            c["subsystem_name"],
            c["dep_count"],
            c["title"][:60],
        )
    log.info("─" * 60)
    log.info("Ready (promotable): %d", sum(1 for c in candidates if c["promotable"]))
    log.info("Total shown: %d", len(candidates))
    return 0


if __name__ == "__main__":
    sys.exit(main())
