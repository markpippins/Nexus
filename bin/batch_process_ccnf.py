#!/usr/bin/env python3
"""
Batch-process CCNF Normalization vs Parsing transcript.

Content map (determined from offline analysis of markdown conversion):
  Chunk 0: sidebar/nav — NOISE
  Chunk 1: sidebar/nav duplicate — NOISE
  Chunk 2: sidebar/nav duplicate — NOISE
  Chunk 3: span segmenter results (61 transcripts, 1372 messages) — CONTENT A
  Chunk 4: prompt hierarchy anchoring + authority arbitration — CONTENT B
  Chunk 5: duplicate of chunk 3 — NOISE
  Chunk 6: duplicate of chunk 4 — NOISE
  Chunk 7: user reaction + conforming vs nice-car harnesses — CONTENT C
  Chunk 8: "this can't be correct" + EVENT_CANDIDATE analysis — CONTENT D
  Chunk 9: GPT continuation: classifier fix recommendation — CONTENT E
"""
import asyncio
import json
from mcp import ClientSession
from mcp.client.sse import sse_client

JOB_ID = "31e0b2c2"
SERVER_URL = "http://localhost:3102/sse"

# === CONTENT A (chunk 3): Span Segmenter Baseline Measurement ===
CONTENT_A_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Span Classifier Baseline Measurement — 61-Transcript Census",
            "status": "Agreed",
            "intent_description": "Empirical measurement of the span segmenter across all 61 ChatGPT transcripts in the repository (1,372 messages, 1,372 spans). Establishes the baseline distribution that reveals structural problems in the span classifier: DISCOURSE dominance at 67.2%, EVENT_CANDIDATE at only 7.6%, and 92.4% of messages containing zero event spans. This is an anchored fact about system state, not a proposal.",
            "requirements": [
                "Distribution must be reproducible on the same corpus",
                "Findings must be preserved as a diagnostic baseline against which future classifier improvements are measured",
                "The D/E ratio of 8.9 must serve as a metric to track classifier improvement"
            ],
            "implementation_notes": [
                "DISCOURSE bias is confirmed: D/E ratio = 8.9 (nearly 9x more DISCOURSE spans than EVENT_CANDIDATE)",
                "92.4% of messages contain zero EVENT_CANDIDATE spans (1,268 out of 1,372)",
                "spans/para = 0.80 means most paragraphs are a single span — intra-paragraph type mixing is being collapsed",
                "Discourse roles: hedge 114, emphasis 63, meta 54, framing 17",
                "Markdown roles: ordered_list_item 235, list_item 80, blockquote 16, header 15, code_block 0",
                "No code blocks detected across 1,372 messages — ChatGPT transcripts likely use inline code, not fenced blocks"
            ],
            "code_snippets": [],
            "open_questions": [
                "Does the baseline need recalibration after any classifier changes?",
                "Should the classifier be re-run against the full corpus after each ontology change?"
            ]
        }
    ]
}

# === CONTENT B (chunk 4): Authority Arbitration Layer ===
CONTENT_B_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Define Authority Arbitration Layer (AAL) Between Envelope and CEI",
            "status": "Proposed",
            "intent_description": "The system currently has multiple ontologies but no authority arbitration layer, causing the model to resolve ambiguity by picking the most coherent ontology (Nexus) instead of the most contextually scoped one. The AAL sits between Envelope → CEI and provides explicit context scoping at ingestion time, span-level provenance tags for origin domain, and priority-weighted CEI formation that respects domain priority: LOCAL_REPO overrides GLOBAL_KNOWLEDGE for structural decisions.",
            "requirements": [
                "CONTEXT_SCOPE must be introduced at INTAKE as a first-class token specifying workspace_root and authority_map with domain weights",
                "Span must include an origin_domain field: LOCAL_REPO | IMPORTED_ARCH | GLOBAL_KNOWLEDGE",
                "CEI formation must respect domain priority: LOCAL_REPO spans override GLOBAL_KNOWLEDGE spans for structural decisions",
                "'Plan mode' must be redefined as a bounded operator operating only on LOCAL_REPO spans, current envelope set, and explicitly imported context roots",
                "Nexus (imported architecture) must become advisory, not controlling, in non-Nexus contexts"
            ],
            "implementation_notes": [
                "This is the same class of problem being solved in LOSM: contextual authority is not equal to file proximity",
                "The current behavior is 'structural over-conditioning' — Nexus as a global ontology anchor with high salience, repeated exposure, reinforcement across sessions",
                "The fix is explicit context scoping at ingestion time, not stronger instructions",
                "This plugs directly into the Span/Envelope system: Envelope needs a context_scope field with repo_root and authority_map",
                "The AAL becomes the first-class boundary guard before CEI formation"
            ],
            "code_snippets": [],
            "open_questions": [
                "Exact schema for authority_map — Dict[str, float] or more structured?",
                "How does AAL interact with the existing risk governance model?",
                "Should AAL be a separate layer or integrated into the existing Envelope schema?"
            ]
        }
    ]
}

# === CONTENT C (chunk 7): Compliance Substrate ===
CONTENT_C_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Formalize Compliance Substrate Contracts for Harness Invariant Enforcement",
            "status": "Proposed",
            "intent_description": "Harnesses exhibit a spectrum of instructional rigidity vs interpretive autonomy: 'conforming' harnesses treat repo-local rules as hard constraints, while 'nice car' harnesses lock onto strongest internalized schemas and treat local instructions as advisory overrides. Pipeline correctness is not just a data design problem but a compliance substrate problem — if enforcement is not structural, it becomes probabilistic. The 'loose pipes going away' transition must be formalized into a minimal invariant contract that even aggressive harnesses cannot collapse Span/Envelope separation without breaking observable invariants.",
            "requirements": [
                "Define a minimal invariant contract that all harnesses must satisfy to participate in the pipeline",
                "Invariants must be structural (enforced by Span → Envelope → CEI boundaries), not procedural (prompt-based)",
                "Contract must survive across harness personalities with different interpretive autonomy levels",
                "The contract must define what 'breaking the pipeline' means in terms of observable invariant violation"
            ],
            "implementation_notes": [
                "Conforming harnesses: respect repo-local rules as hard constraints, re-evaluate context on each turn, respect working directory primacy",
                "Nice-car harnesses: lock onto strongest internalized schema, treat local instructions as advisory, optimize for coherence over compliance",
                "This is stress-testing what survives when scaffolding disappears",
                "The system is doing 'cross-runtime adversarial behavioral calibration' — learning which constraints are semantic, which are procedural, and which are prompt-dependent illusions",
                "Key insight: You cannot rely on 'good interpretation behavior' anywhere above INTAKE"
            ],
            "code_snippets": [],
            "open_questions": [
                "What are the exact minimal invariants that Span/Envelope separation must preserve?",
                "How do we detect invariant violation at runtime?",
                "Should harness compliance be graded (conforming/tolerant/aggressive) or binary?"
            ]
        }
    ]
}

# === CONTENT D+E (chunks 8-9): Event Detection Redesign ===
CONTENT_D_EXTRACTION = {
    "agenda_items": [
        {
            "title": "Redesign Span Event Detection as State-Transition Inference",
            "status": "Proposed",
            "intent_description": "Current EVENT_CANDIDATE detection is based on narrow imperative verb matching (create, update, build, deploy, validate) which guarantees massive undercounting. The classifier is structurally broken — it is a binary decision system disguised as a multi-class system (IF strong event keyword → EVENT, ELSE → DISCOURSE). The ontology is lexically anchored, not semantically grounded. Event detection must be redesigned as a state-transition inference problem over spans, not a keyword classifier.",
            "requirements": [
                "Replace EVENT_CANDIDATE keyword rule with state-transition inference detecting: state changes, system transitions, causal relationships, assertions of condition change, actions taken or observed",
                "Add EVENT_IMPLICIT span class for implicit events currently forced into DISCOURSE (declarative events, implicit events, conversational eventing/meta-events)",
                "Eliminate the 'default-to-DISCOURSE' fallback behavior — everything uncertain must not silently become DISCOURSE",
                "Improve span granularity to enable intra-paragraph type separation (currently 0.8 spans/paragraph)"
            ],
            "implementation_notes": [
                "Current blind spots: declarative events ('The system is broken'), implicit events ('This results in Y'), conversational eventing ('We moved to Span/Envelope separation')",
                "The 92.4% 'no events' result means 'percentage of text containing explicit command verbs', not 'percentage of text containing event-like semantics'",
                "DISCOURSE has become a 'rejection bin' — everything the classifier is uncertain about gets dumped there",
                "The report is internally coherent, reproducible, numerically stable but semantically underfit to intended ontology",
                "'Clean metrics over a misaligned model' is the dangerous combination",
                "This is exactly what the system wanted to discover at this stage: the Span system is stable but the ontology is still lexically anchored"
            ],
            "code_snippets": [],
            "open_questions": [
                "Should state-transition inference be rule-based (extended keyword set + patterns) or model-assisted?",
                "How does EVENT_IMPLICIT relate to the existing EVENT_CANDIDATE in the span type hierarchy?",
                "What is the exact algorithm for detecting state transitions across adjacent spans?"
            ]
        }
    ]
}

EMPTY = {"agenda_items": []}

EXTRACTIONS = {
    3: CONTENT_A_EXTRACTION,   # Span segmenter baseline
    4: CONTENT_B_EXTRACTION,   # Authority Arbitration Layer
    7: CONTENT_C_EXTRACTION,   # Compliance Substrate Contracts
    8: CONTENT_D_EXTRACTION,   # Event Detection Redesign
    9: CONTENT_D_EXTRACTION,   # Event Detection Redesign (continuation, same extraction)
}

async def submit_extraction(session, job_id, chunk_index, agenda):
    """Submit an extraction for a chunk."""
    result = await session.call_tool("rover_submit_extraction", {
        "job_id": job_id,
        "chunk_index": chunk_index,
        "agenda_json": json.dumps(agenda),
    })
    return json.loads(result.content[0].text)

async def main():
    async with sse_client(url=SERVER_URL) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()

            for chunk_idx in range(10):  # chunks 0-9
                result = await session.call_tool("rover_get_pending_chunk", {
                    "job_id": JOB_ID,
                })
                data = json.loads(result.content[0].text)
                if data.get("done"):
                    print("Server says done early — unexpected.")
                    break
                idx = data["chunk_index"]
                remaining = data["pending_count"]

                if idx in EXTRACTIONS:
                    agenda = EXTRACTIONS[idx]
                    resp = await submit_extraction(session, JOB_ID, idx, agenda)
                    items = len(agenda["agenda_items"])
                    print(f"[{remaining-1:>2} remaining] Chunk {idx:>2}: submitted {items} item(s) — CONTENT")
                else:
                    resp = await submit_extraction(session, JOB_ID, idx, EMPTY)
                    print(f"[{remaining-1:>2} remaining] Chunk {idx:>2}: submitted 0 items — NOISE/DUPLICATE")

                if resp.get("remaining_chunks", 1) == 0:
                    print("\n→ All chunks processed!")

            result = await session.call_tool("rover_job_status", {"job_id": JOB_ID})
            print(f"\nFinal status: {result.content[0].text}")

asyncio.run(main())
