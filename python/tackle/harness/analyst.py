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
from datetime import datetime, timezone
from typing import Any

import psycopg2

from .base import Harness, ModelConfig

log = logging.getLogger("analyst")


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


# ── Context Building ──────────────────────────────────────────────────

def fetch_unanswered_questions(conn, limit: int = 5) -> list[dict]:
    """Fetch OPEN questions with no answer (answered_by IS NULL)."""
    cur = conn.cursor()
    cur.execute("""
        SELECT
            id, title, description, category, blocking,
            requirement_id, candidate_id, created_by
        FROM nebula.open_questions
        WHERE status = 'OPEN' AND answered_by IS NULL
        ORDER BY blocking DESC, created_at ASC
        LIMIT %s
    """, (limit,))
    cols = [d.name for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return rows


def build_question_context(conn, question: dict) -> dict:
    """Build rich context for a single question."""
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

    return {
        "question": question,
        "requirement": requirement,
        "candidate": candidate,
        "similar_answers": similar,
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
