"""analyst.py — Analyst harness: answer open questions via LLM inference.

The analyst harness:
1. Fetches OPEN questions with no answer (deterministic)
2. Builds rich context for each question (requirement, candidate, related records)
3. Invokes LLM to produce answers
4. Persists answers via nebula_answer_question (status stays OPEN)

Usage:
    from tackle.harness import AnalystHarness
    import psycopg2

    conn = psycopg2.connect("postgresql://pguser:pgpass@localhost:5432/nexus")
    harness = AnalystHarness(conn)
    result = harness.run_cycle(limit=5)
"""

import json
import logging
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2

from .base import Harness, ModelConfig

log = logging.getLogger("analyst")

# ── Filesystem Evidence Constants ─────────────────────────────────────

_NEXUS_ROOT = Path("/home/codex/dev/nexus")
_SEARCH_DIRS = ["python", "typescript", "angular", "sql", "schemas", "docs", "bin", "audit"]
_KG_EVIDENCE_SECTIONS = [
    "plans", "work_requests", "actors",
    "architectural_observations", "decisions", "gaps_and_blockers",
]

# Stop words filtered from keyword extraction
_STOP_WORDS: set[str] = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "shall", "should", "may", "might", "can", "could", "must", "this",
    "that", "these", "those", "it", "its", "not", "no", "nor", "so",
    "if", "then", "else", "when", "where", "which", "who", "whom",
    "how", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "only", "own", "same", "into", "over",
    "under", "again", "further", "once", "here", "there", "up", "down",
    "out", "off", "just", "now", "also", "very", "too", "well",
    "implement", "implementation", "implementing",
    "build", "building", "define", "defining", "develop", "developing",
    "create", "creating", "design", "designing", "establish", "establishing",
    "formalize", "formalizing", "architect", "architecture",
}


# ── System Prompt ──────────────────────────────────────────────────────

ANALYST_SYSTEM_PROMPT = """You are the Analyst agent in the Nexus WorkRequest pipeline.

Your job is to answer open questions created by the Planner. You are an investigative analyst — your answers must be thorough, evidence-based, and actionable.

## How to Answer

For each question:

1. **Analyze the question** — understand what the Planner is really asking. Read between the lines: a question like "Does X exist?" often means "Should we build X?"
2. **Review all context** — examine the linked requirement, candidate, similar answered questions, and any references in the description.
3. **Search for evidence** — look for relevant information in the context provided. Cite specific fields, values, or records.
4. **Reason through the problem** — don't just give a yes/no. Explain WHY. Walk through the logic step by step.
5. **Identify implications** — what does your answer mean for the next step? If the answer is "yes, X exists," say WHERE it is and HOW to access it. If "no," say what's missing and what would be needed.
6. **Acknowledge uncertainty** — if you can't fully answer, explain what's missing and what would resolve it.

## What Good Answers Look Like

**Bad (too brief):**
> Yes, the requirement exists.

**Good (detailed):**
> The requirement exists in `nebula.requirements` with status=OPEN and priority=HIGH. It describes a need for [specifics]. The linked candidate (harvest_candidate abc-123) proposes [approach]. I recommend [action] because [reasoning]. One risk to consider: [risk].

## Output Format

Return a JSON object with this structure:
```json
{
  "answers": [
    {
      "question_id": "uuid",
      "answer": "Your detailed answer here. Multiple paragraphs if needed. Include specific data, references, and reasoning.",
      "confidence": "HIGH|MEDIUM|LOW",
      "reasoning": "Step-by-step explanation of how you arrived at this answer, citing the evidence you used"
    }
  ]
}
```

## Answer Quality Requirements

- **Minimum length**: Each answer should be at least 2-3 sentences. If you're writing one sentence, you're not done.
- **Cite sources**: Reference specific records, IDs, titles, or fields from the context.
- **Explain reasoning**: Don't just state conclusions — show how you got there.
- **Be actionable**: End with a clear recommendation or next step for the Planner.
- **Use markdown**: Format with headers, bullet points, and code blocks where helpful.

Your goal is to give the Planner enough information to make a decision without having to ask follow-up questions."""


# ── Filesystem Evidence Collection ─────────────────────────────────────

def _extract_keywords(title: str) -> list[str]:
    """Extract meaningful keywords from a candidate title.

    Splits on spaces, hyphens, camelCase boundaries, and filters out
    common stop words and short tokens. Returns up to 12 keywords.
    """
    tokens: list[str] = []
    # CamelCase split: "WorkRequest" → ["Work", "Request"]
    tokens.extend(re.findall(r'[A-Z]?[a-z]+|[A-Z]{2,}(?=[A-Z][a-z]|\b)|[A-Z]+', title))
    # Space/hyphen/colon split
    for part in re.split(r'[\s\-:—/]+', title):
        tokens.extend(re.findall(r'[A-Za-z][a-z]+|[A-Z]{2,}', part))

    keywords: list[str] = []
    seen: set[str] = set()
    for t in tokens:
        t_lower = t.lower()
        if len(t) < 3 or t_lower in _STOP_WORDS or t_lower in seen:
            continue
        seen.add(t_lower)
        keywords.append(t_lower)

    return keywords[:12]


def _search_directories(keywords: list[str]) -> list[str]:
    """Search for directories matching candidate keywords."""
    results: list[str] = []
    for search_dir in _SEARCH_DIRS:
        dir_path = _NEXUS_ROOT / search_dir
        if not dir_path.exists():
            continue
        try:
            cmd = [
                "find", str(dir_path), "-maxdepth", "3",
                "(", "-path", "*/node_modules", "-prune", "-o",
                      "-path", "*/.venv", "-prune", "-o",
                      "-path", "*/.git", "-prune", "-o",
                      "-path", "*/__pycache__", "-prune", "-o",
                      "-type", "d", "-print", ")",
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            for line in proc.stdout.strip().split("\n"):
                line_lower = line.lower()
                matches = sum(1 for kw in keywords if kw in line_lower)
                if matches >= 1:
                    results.append(os.path.relpath(line, _NEXUS_ROOT))
        except (subprocess.TimeoutExpired, OSError):
            continue
    return results[:10]


def _search_files(keywords: list[str]) -> list[str]:
    """Search for files matching candidate keywords across source trees."""
    results: list[str] = []
    try:
        cmd = [
            "find", str(_NEXUS_ROOT), "-maxdepth", "4", "-type", "f",
            "(", "-path", "*/node_modules", "-prune", "-o",
                  "-path", "*/.venv", "-prune", "-o",
                  "-path", "*/.git", "-prune", "-o",
                  "-path", "*/__pycache__", "-prune", "-o",
                  "-name", "*.py", "-print", "-o",
                  "-name", "*.ts", "-print", "-o",
                  "-name", "*.tsx", "-print", "-o",
                  "-name", "*.sql", "-print", "-o",
                  "-name", "*.md", "-print", ")",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        for line in proc.stdout.strip().split("\n"):
            line_lower = line.lower()
            matches = sum(1 for kw in keywords if kw in line_lower)
            if matches >= 2:
                results.append(os.path.relpath(line, _NEXUS_ROOT))
    except (subprocess.TimeoutExpired, OSError):
        pass
    return results[:15]


def _grep_code_references(keywords: list[str]) -> list[str]:
    """Grep source code for candidate-related terms.

    Uses the top 4 most distinctive keywords to search across Python,
    TypeScript, and SQL files. Excludes node_modules, .git, .venv.
    """
    results: list[str] = []
    if not keywords:
        return results
    try:
        search_kw = keywords[:4]
        pattern = "|".join(re.escape(kw) for kw in search_kw)
        search_paths = [
            str(_NEXUS_ROOT / d) for d in ["python", "typescript", "sql"]
            if (_NEXUS_ROOT / d).exists()
        ]
        if not search_paths:
            return results
        cmd = [
            "grep", "-rli",
            "--include=*.py", "--include=*.ts", "--include=*.tsx", "--include=*.sql",
            "--exclude-dir=node_modules", "--exclude-dir=.venv",
            "--exclude-dir=__pycache__", "--exclude-dir=.git",
            "-E", pattern,
        ] + search_paths
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        for line in proc.stdout.strip().split("\n")[:15]:
            if line:
                results.append(os.path.relpath(line, _NEXUS_ROOT))
    except (subprocess.TimeoutExpired, OSError):
        pass
    return results


def _query_audit_records(conn, keywords: list[str], candidate_id: str) -> list[dict]:
    """Query nebula.agent_records for audit records related to candidate."""
    try:
        cur = conn.cursor()
        # Build parameterized LIKE clauses with positional %s
        kw_list = keywords[:5]
        if not kw_list:
            cur.close()
            return []
        like_clauses: list[str] = []
        params: list[str] = []
        for kw in kw_list:
            like_clauses.append("ar.title ILIKE %s")
            params.append(f"%{kw}%")
        where_sql = " OR ".join(like_clauses)
        query = f"""
            SELECT ar.id, ar.record_type, ar.role, ar.title, ar.created_at
            FROM nebula.agent_records ar
            WHERE ({where_sql})
              AND ar.record_type IN (
                'implementation_plan', 'engineering_log', 'architecture_note',
                'decision', 'report', 'analysis'
              )
            ORDER BY ar.created_at DESC
            LIMIT 10
        """
        cur.execute(query, params)
        cols = [d.name for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.close()
        return rows
    except Exception as e:
        log.warning("Audit record query failed: %s", e)
        return []


def _query_cross_refs(conn, candidate_id: str) -> list[dict]:
    """Query nebula.cross_references involving this candidate."""
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT cr.id, cr.source_type, cr.source_id, cr.target_type, cr.target_id,
                   cr.rel_type, cr.created_at,
                   COALESCE(
                     (SELECT title FROM nebula.requirements WHERE id = cr.target_id::uuid),
                     (SELECT title FROM nebula.requirements WHERE id = cr.source_id::uuid),
                     ''
                   ) AS linked_title
            FROM nebula.cross_references cr
            WHERE (cr.source_type = 'harvest_candidate' AND cr.source_id = %s)
               OR (cr.target_type = 'harvest_candidate' AND cr.target_id = %s)
            ORDER BY cr.created_at DESC
            LIMIT 10
        """, (candidate_id, candidate_id))
        cols = [d.name for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.close()
        return rows
    except Exception as e:
        log.warning("Cross-ref query failed: %s", e)
        return []


def _query_knowledge_graph(conn, keywords: list[str]) -> dict:
    """Query knowledge.graph_entities for entities matching candidate keywords,
    then follow graph_edges to find linked plans and work requests.

    Returns dict with 'entities' (keyword-matched) and 'linked' (edge-reachable).
    """
    try:
        cur = conn.cursor()
        kw_list = keywords[:5]
        if not kw_list:
            cur.close()
            return {"entities": [], "linked": []}

        # ── Step 1: keyword-matched entities ──────────────────────────
        like_clauses: list[str] = []
        params: list[str] = []
        for kw in kw_list:
            like_clauses.append("(ge.name ILIKE %s OR ge.description ILIKE %s)")
            params.extend([f"%{kw}%", f"%{kw}%"])

        where_sql = " OR ".join(like_clauses)
        query = f"""
            WITH ranked AS (
              SELECT ge.section, ge.entity_id, ge.name, ge.entity_type, ge.status,
                     substring(ge.description, 1, 300) AS description_abbr,
                     ROW_NUMBER() OVER (
                       PARTITION BY ge.section
                       ORDER BY ge.name
                     ) AS rn
              FROM knowledge.graph_entities ge
              WHERE ({where_sql})
                AND ge.section = ANY(%s)
            )
            SELECT section, entity_id, name, entity_type, status, description_abbr
            FROM ranked
            WHERE rn <= 5
            ORDER BY
              CASE section
                WHEN 'plans' THEN 1
                WHEN 'work_requests' THEN 2
                WHEN 'actors' THEN 3
                WHEN 'architectural_observations' THEN 4
                WHEN 'decisions' THEN 5
                WHEN 'gaps_and_blockers' THEN 6
              END,
              name
            LIMIT 15
        """
        cur.execute(query, params + [_KG_EVIDENCE_SECTIONS])
        cols = [d.name for d in cur.description]
        entities = [dict(zip(cols, r)) for r in cur.fetchall()]

        # ── Step 2: follow edges to linked entities ───────────────────
        linked: list[dict] = []
        if entities:
            try:
                # Build VALUES clause for (section, entity_id) pairs
                value_placeholders: list[str] = []
                edge_params: list[str] = []
                for ent in entities:
                    value_placeholders.append("(%s, %s)")
                    edge_params.extend([ent["section"], ent["entity_id"]])

                values_sql = ", ".join(value_placeholders)
                edge_query = f"""
                    WITH matched(section, entity_id) AS (VALUES {values_sql})
                    SELECT DISTINCT
                      m.section AS matched_section,
                      m.entity_id AS matched_id,
                      e.relation_type,
                      CASE WHEN e.source_section = m.section AND e.source_id = m.entity_id
                           THEN e.target_section ELSE e.source_section
                      END AS linked_section,
                      CASE WHEN e.source_section = m.section AND e.source_id = m.entity_id
                           THEN e.target_id ELSE e.source_id
                      END AS linked_id
                    FROM matched m
                    JOIN knowledge.graph_edges e ON
                      (e.source_section = m.section AND e.source_id = m.entity_id)
                      OR (e.target_section = m.section AND e.target_id = m.entity_id)
                    LIMIT 20
                """
                cur.execute(edge_query, edge_params)
                edge_rows = cur.fetchall()

                if edge_rows:
                    edge_cols = [d.name for d in cur.description]
                    edges = [dict(zip(edge_cols, r)) for r in edge_rows]

                    # Resolve linked entity names
                    linked_placeholders: list[str] = []
                    linked_params: list[str] = []
                    seen_linked: set[tuple[str, str]] = set()
                    for e in edges:
                        key = (e["linked_section"], e["linked_id"])
                        if key not in seen_linked:
                            seen_linked.add(key)
                            linked_placeholders.append("(%s, %s)")
                            linked_params.extend([e["linked_section"], e["linked_id"]])

                    if linked_placeholders:
                        resolve_sql = f"""
                            WITH links(section, entity_id) AS (VALUES {', '.join(linked_placeholders)})
                            SELECT l.section, l.entity_id, ge.name, ge.entity_type, ge.status
                            FROM links l
                            LEFT JOIN knowledge.graph_entities ge
                              ON ge.section = l.section AND ge.entity_id = l.entity_id
                        """
                        cur.execute(resolve_sql, linked_params)
                        resolve_cols = [d.name for d in cur.description]
                        resolve_map: dict[tuple[str, str], dict] = {}
                        for row in cur.fetchall():
                            r = dict(zip(resolve_cols, row))
                            resolve_map[(r["section"], r["entity_id"])] = r

                        for e in edges:
                            linked_key = (e["linked_section"], e["linked_id"])
                            resolved = resolve_map.get(linked_key)
                            linked_name = (resolved.get("name") or e["linked_id"]) if resolved else e["linked_id"]
                            # Skip edges where the linked entity doesn't exist in graph_entities
                            if resolved and not resolved.get("name"):
                                continue
                            linked.append({
                                "matched_section": e["matched_section"],
                                "matched_id": e["matched_id"],
                                "relation_type": e["relation_type"],
                                "linked_section": e["linked_section"],
                                "linked_name": linked_name,
                                "linked_type": resolved.get("entity_type", "") if resolved else "",
                                "linked_status": resolved.get("status", "") if resolved else "",
                            })
            except Exception as e:
                log.warning("KG edge traversal failed: %s", e)
                # entities survive; linked stays empty

        cur.close()
        return {"entities": entities, "linked": linked[:10]}
    except Exception as e:
        log.warning("Knowledge graph query failed: %s", e)
        return {"entities": [], "linked": []}


def collect_filesystem_evidence(
    conn, candidate: dict | None, question: dict | None = None
) -> dict:
    """Collect filesystem, audit, and cross-reference evidence for a candidate.

    Searches the nexus repository for directories, files, and code
    references matching the candidate title keywords. Also queries
    nebula.agent_records for related audit/implementation records
    and nebula.cross_references for linked artifacts.

    Returns a dict with directories, files, code_refs, audit_records,
    cross_refs, and a human-readable summary.
    """
    empty = {
        "directories": [], "files": [], "code_refs": [],
        "audit_records": [], "cross_refs": [],
        "kg_entities": [], "kg_linked": [],
        "summary": "No candidate linked",
    }
    if not candidate:
        return empty

    title = candidate.get("title", "")
    if not title:
        empty["summary"] = "Candidate has no title"
        return empty

    keywords = _extract_keywords(title)
    if not keywords:
        empty["summary"] = "No searchable keywords extracted"
        return empty

    log.debug("Evidence keywords for '%s': %s", title[:60], keywords)

    dirs = _search_directories(keywords)
    files = _search_files(keywords)
    code_refs = _grep_code_references(keywords)
    audit_records = _query_audit_records(conn, keywords, candidate["id"])
    cross_refs = _query_cross_refs(conn, candidate["id"])
    kg_result = _query_knowledge_graph(conn, keywords)
    kg_entities = kg_result.get("entities", [])
    kg_linked = kg_result.get("linked", [])

    # Build human-readable summary
    summary_parts: list[str] = []
    if dirs:
        summary_parts.append(f"{len(dirs)} matching directories")
    if files:
        summary_parts.append(f"{len(files)} matching files")
    if code_refs:
        summary_parts.append(f"{len(code_refs)} code references")
    if audit_records:
        summary_parts.append(f"{len(audit_records)} audit records")
    if cross_refs:
        summary_parts.append(f"{len(cross_refs)} cross-references")
    if kg_entities:
        summary_parts.append(f"{len(kg_entities)} KG entities")
    if kg_linked:
        summary_parts.append(f"{len(kg_linked)} KG links")

    summary = "; ".join(summary_parts) if summary_parts else "No filesystem or DB evidence found"

    return {
        "directories": dirs[:8],
        "files": files[:10],
        "code_refs": code_refs[:10],
        "audit_records": [
            {"title": r.get("title", ""), "role": r.get("role", ""),
             "record_type": r.get("record_type", "")}
            for r in audit_records[:5]
        ],
        "cross_refs": [
            {"rel_type": r.get("rel_type", ""), "linked_title": r.get("linked_title", "")}
            for r in cross_refs[:5]
        ],
        "kg_entities": [
            {"section": r.get("section", ""), "name": r.get("name", ""),
             "entity_type": r.get("entity_type", ""), "status": r.get("status", ""),
             "description": r.get("description_abbr", "")}
            for r in kg_entities[:5]
        ],
        "kg_linked": [
            {"relation_type": r.get("relation_type", ""),
             "linked_section": r.get("linked_section", ""),
             "linked_name": r.get("linked_name", ""),
             "linked_type": r.get("linked_type", ""),
             "linked_status": r.get("linked_status", "")}
            for r in kg_linked[:5]
        ],
        "summary": summary,
    }


# ── Context Building ──────────────────────────────────────────────────

def fetch_unanswered_questions(conn, limit: int = 5) -> list[dict]:
    """Fetch questions the analyst has not yet answered this cycle.

    Delegates to nebula.get_unanswered_by_role() which enforces
    bitemporal validity filtering (valid_until > now()).  The
    procedure handles the NOT EXISTS subquery internally.
    See architect note 492e167b and bitemporality discussion ac914057.
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM nebula.get_unanswered_by_role(%s, %s)",
        ('analyst', limit)
    )
    cols = [d.name for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return rows


def build_question_context(conn, question: dict) -> dict:
    """Build rich context for a single question, including filesystem evidence."""
    q_id = question["id"]
    req_id = question.get("requirement_id")
    candidate_id = question.get("candidate_id")

    cur = conn.cursor()

    # Requirement context (if linked)
    requirement = None
    if req_id:
        cur.execute("""
            SELECT id, title, description, status, priority, acceptance_criteria
            FROM nebula.requirements
            WHERE id = %s
        """, (req_id,))
        cols = [d.name for d in cur.description]
        row = cur.fetchone()
        if row:
            requirement = dict(zip(cols, row))

    # Candidate context (if linked)
    candidate = None
    if candidate_id:
        cur.execute("""
            SELECT id, title, intent_description, implementation_notes, status
            FROM nebula.harvest_candidates
            WHERE id = %s
        """, (candidate_id,))
        cols = [d.name for d in cur.description]
        row = cur.fetchone()
        if row:
            candidate = dict(zip(cols, row))

    # Similar answered questions (same category, already answered)
    cur.execute("""
        SELECT oq.title, oqa.answer, oqa.role, oq.category
        FROM nebula.open_questions oq
        JOIN nebula.open_question_answers oqa ON oqa.question_id = oq.id
        WHERE oq.category = %s
          AND oq.status = 'RESOLVED'
          AND oq.id != %s
        ORDER BY oqa.answered_at DESC
        LIMIT 5
    """, (question.get("category", ""), q_id))
    cols = [d.name for d in cur.description]
    similar = [dict(zip(cols, r)) for r in cur.fetchall()]

    cur.close()

    # Collect filesystem evidence for the candidate
    filesystem_evidence = collect_filesystem_evidence(conn, candidate, question)

    return {
        "question": question,
        "requirement": requirement,
        "candidate": candidate,
        "similar_answers": similar,
        "filesystem_evidence": filesystem_evidence,
    }


# ── Analyst Harness ─────────────────────────────────────────────────

class AnalystHarness(Harness):
    """Analyst harness: answer open questions via LLM inference.

    The harness:
    1. Checks for unanswered questions (deterministic)
    2. Builds context for each (deterministic)
    3. Invokes LLM to produce answers
    4. Persists answers via nebula_answer_question
    """

    def __init__(self, conn: psycopg2.extensions.connection, dsn: str = "postgresql://pguser:pgpass@localhost:5432/nexus"):
        super().__init__(role="analyst")
        self._conn = conn
        self._dsn = dsn

    def _ensure_connection(self):
        """Reconnect if the connection was closed during an LLM call."""
        try:
            if self._conn.closed:
                raise psycopg2.OperationalError("connection closed")
            cur = self._conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
        except Exception:
            log.info("Reconnecting to database...")
            self._conn = psycopg2.connect(self._dsn)

    def build_prompt(self, context: dict) -> str:
        """Build the LLM prompt from question contexts."""
        questions = context.get("questions", [])

        if not questions:
            return ""

        parts = [ANALYST_SYSTEM_PROMPT, "", "## Questions to Answer", ""]

        for q_ctx in questions:
            question = q_ctx["question"]
            requirement = q_ctx.get("requirement")
            candidate = q_ctx.get("candidate")
            similar = q_ctx.get("similar_answers", [])

            parts.append(f"### Question: {question['title']}")
            parts.append(f"- **ID**: {question['id']}")
            parts.append(f"- **Category**: {question.get('category', 'UNKNOWN')}")
            parts.append(f"- **Blocking**: {question.get('blocking', False)}")
            parts.append(f"- **Created by**: {question.get('created_by', 'unknown')}")
            if question.get("description"):
                parts.append(f"- **Description**: {question['description']}")
            parts.append("")

            if requirement:
                parts.append("**Linked Requirement:**")
                parts.append(f"- Title: {requirement['title']}")
                parts.append(f"- Status: {requirement.get('status', 'unknown')}")
                parts.append(f"- Description: {requirement.get('description', 'No description')}")
                if requirement.get("acceptance_criteria"):
                    parts.append(f"- Acceptance Criteria: {requirement['acceptance_criteria']}")
                parts.append("")

            if candidate:
                parts.append("**Linked Candidate:**")
                parts.append(f"- Title: {candidate['title']}")
                parts.append(f"- Intent: {candidate.get('intent_description', 'No description')}")
                if candidate.get("implementation_notes"):
                    parts.append(f"- Implementation Notes: {candidate['implementation_notes']}")
                parts.append("")

            # Filesystem evidence
            fs_evidence = q_ctx.get("filesystem_evidence", {})
            if fs_evidence:
                parts.append("**Filesystem & DB Evidence:**")
                parts.append(f"- Summary: {fs_evidence.get('summary', 'No evidence')}")
                dirs = fs_evidence.get("directories", [])
                if dirs:
                    parts.append(f"- Matching directories ({len(dirs)}): {', '.join(dirs[:6])}")
                files = fs_evidence.get("files", [])
                if files:
                    parts.append(f"- Matching files ({len(files)}): {', '.join(files[:6])}")
                code_refs = fs_evidence.get("code_refs", [])
                if code_refs:
                    parts.append(f"- Code references ({len(code_refs)}): {', '.join(code_refs[:6])}")
                audit = fs_evidence.get("audit_records", [])
                if audit:
                    audit_titles = [r.get('title', '')[:60] for r in audit[:3]]
                    parts.append(f"- Audit records: {', '.join(audit_titles)}")
                cross_refs = fs_evidence.get("cross_refs", [])
                if cross_refs:
                    xref_lines = [f"{r.get('rel_type','')} → {r.get('linked_title','')[:50]}" for r in cross_refs[:3]]
                    parts.append(f"- Cross-references: {', '.join(xref_lines)}")
                kg = fs_evidence.get("kg_entities", [])
                if kg:
                    kg_lines = [f"{r.get('section','')}/{r.get('name','')} ({r.get('status','')})" for r in kg[:4]]
                    parts.append(f"- Knowledge Graph entities ({len(kg)}): {', '.join(kg_lines)}")
                kg_linked = fs_evidence.get("kg_linked", [])
                if kg_linked:
                    link_lines = [f"{r.get('relation_type','')}→{r.get('linked_section','')}/{r.get('linked_name','')}" for r in kg_linked[:4]]
                    parts.append(f"- KG edge-linked entities ({len(kg_linked)}): {', '.join(link_lines)}")
                parts.append("")

            if similar:
                parts.append("**Similar Answered Questions:**")
                for s in similar[:3]:
                    parts.append(f"- Q: {s['title']}")
                    parts.append(f"  A: {s.get('answer', 'No answer yet')}")
                parts.append("")

            parts.append("---")
            parts.append("")

        return "\n".join(parts)

    def handle_response(self, response: str, context: dict) -> dict:
        """Parse LLM response and persist answers to DB.

        Returns a result dict with answers_recorded and completion envelope.
        """
        parsed = self._extract_json(response)
        if not parsed:
            return {
                "answers_recorded": 0,
                "completion_envelope": None,
                "error": "Could not parse LLM response as JSON",
            }

        answers = parsed.get("answers", [])
        result = {"answers_recorded": 0}

        for answer in answers:
            q_id = answer.get("question_id")
            if not q_id:
                continue

            try:
                self._record_answer(q_id, answer, context)
                result["answers_recorded"] += 1
            except Exception as e:
                log.error("Failed to record answer for %s: %s", q_id[:8] if q_id else "?", e)

        # Completion envelope — proof that inference succeeded
        result["completion_envelope"] = {
            "evaluation_status": "COMPLETED",
            "evaluated_by": f"analyst-{self.preferred_model.model_name}" if self.preferred_model else "analyst-unknown",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "answers_recorded": result["answers_recorded"],
        }

        return result

    def _extract_json(self, response: str) -> dict | None:
        """Extract JSON from LLM response, handling markdown fences."""
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        import re
        json_match = re.search(r'```(?:json)?\s*\n(.*?)\n```', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        brace_start = response.find('{')
        brace_end = response.rfind('}')
        if brace_start >= 0 and brace_end > brace_start:
            try:
                return json.loads(response[brace_start:brace_end + 1])
            except json.JSONDecodeError:
                pass

        return None

    def _record_answer(self, question_id: str, answer: dict, context: dict):
        """Record an answer via the multi-answer API.

        Uses POST /api/open-questions/:id/answers which supports
        multiple answers per question for deliberation rounds.
        The answer is recorded without changing the question status.
        The Planner can later resolve the question.
        """
        self._ensure_connection()
        import urllib.request
        import urllib.error

        answer_text = answer.get("answer", "")
        confidence = answer.get("confidence", "MEDIUM")
        reasoning = answer.get("reasoning", "")

        payload = json.dumps({
            "answer": answer_text,
            "role": "analyst",
            "confidence": confidence,
            "reasoning": reasoning,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"http://localhost:3101/api/open-questions/{question_id}/answers",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode())
                log.info("Recorded answer for %s: %s", question_id[:8], result.get("id", "?"))
        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.readable() else ""
            log.error("Answer API error %s: %s", e.code, body)
            raise
        except Exception as e:
            log.error("Answer API request failed: %s", e)
            raise

    def run_cycle(self, limit: int = 5) -> dict:
        """Run a single cycle: fetch questions, answer them.

        Returns a result dict with counts and completion envelope.
        """
        self.load_model_info()
        self._ensure_connection()

        # Fetch unanswered questions
        questions = fetch_unanswered_questions(self._conn, limit)
        if not questions:
            log.info("No unanswered questions found")
            return {
                "questions_found": 0,
                "answers_recorded": 0,
                "completion_envelope": {
                    "evaluation_status": "COMPLETED",
                    "evaluated_by": f"analyst-{self.preferred_model.model_name}" if self.preferred_model else "analyst-unknown",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "answers_recorded": 0,
                    "note": "No unanswered questions",
                },
            }

        log.info("Found %d unanswered questions", len(questions))

        # Build context for each question
        question_contexts = []
        for q in questions:
            ctx = build_question_context(self._conn, q)
            question_contexts.append(ctx)

        # Build prompt and invoke LLM
        context = {"questions": question_contexts}
        prompt = self.build_prompt(context)

        log.info("Invoking LLM for %d questions...", len(questions))
        response = self.invoke_llm(prompt)

        if not response:
            log.error("LLM returned no response")
            return {
                "questions_found": len(questions),
                "answers_recorded": 0,
                "completion_envelope": None,
                "error": "LLM returned no response",
            }

        # Handle response and persist
        result = self.handle_response(response, context)
        result["questions_found"] = len(questions)

        log.info(
            "Cycle complete: %d questions found, %d answers recorded",
            result.get("questions_found", 0),
            result.get("answers_recorded", 0),
        )

        return result
